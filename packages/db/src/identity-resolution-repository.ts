import { identityStatusSchema, type IdentityStatus } from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

export type AuthenticatedIdentityResolutionSession = Readonly<{
  repository: IdentityResolutionRepository;
  userId: string;
}>;

export async function authenticateIdentityResolutionSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedIdentityResolutionSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new IdentityResolutionRepository(client),
    userId: data.user.id,
  };
}

export class IdentityResolutionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  // Resolves the identity of the person on a scanned card by looking up and
  // upserting records in the user-scoped people and organizations tables.
  // Returns the computed IdentityStatus, which is also written to people.identity_status
  // so Flash Brief can read it as a confidence floor via business_cards.person_id.
  async resolve(scanId: string, userId: string): Promise<IdentityStatus> {
    const { data: card, error: cardError } = await this.client
      .from("business_cards")
      .select("name,company,title,department,email")
      .eq("scan_id", scanId)
      .maybeSingle();

    if (cardError || !card?.name) {
      return "unresolved";
    }

    const name = card.name.trim();
    const company = card.company?.trim() ?? null;
    const emailDomain = extractEmailDomain(card.email);

    const [orgId, { personId, priorScanCount }] = await Promise.all([
      this.upsertOrganization(userId, company, emailDomain),
      this.upsertPerson(userId, scanId, name, card.title, card.department),
    ]);

    await this.client
      .from("business_cards")
      .update({ organization_id: orgId, person_id: personId })
      .eq("scan_id", scanId);

    const status = computeStatus(name, company, emailDomain, priorScanCount);

    if (personId) {
      await this.client
        .from("people")
        .update({ identity_status: status })
        .eq("id", personId);
    }

    return status;
  }

  private async upsertOrganization(
    userId: string,
    company: string | null,
    emailDomain: string | null,
  ): Promise<string | null> {
    if (!company) {
      return null;
    }

    const { data: rows } = await this.client
      .from("organizations")
      .select("id,domain")
      .ilike("name", company)
      .limit(1);

    const existing = rows?.[0] ?? null;

    if (existing) {
      if (emailDomain && !existing.domain) {
        await this.client
          .from("organizations")
          .update({ domain: emailDomain })
          .eq("id", existing.id);
      }

      return existing.id;
    }

    const { data: created } = await this.client
      .from("organizations")
      .insert({ domain: emailDomain, name: company, owner_user_id: userId })
      .select("id")
      .single();

    return created?.id ?? null;
  }

  private async upsertPerson(
    userId: string,
    scanId: string,
    name: string,
    title: string | null,
    department: string | null,
  ): Promise<{ personId: string | null; priorScanCount: number }> {
    const { data: rows } = await this.client
      .from("people")
      .select("id")
      .ilike("name", name)
      .limit(1);

    const existing = rows?.[0] ?? null;

    if (existing) {
      const { count } = await this.client
        .from("business_cards")
        .select("*", { count: "exact", head: true })
        .eq("person_id", existing.id)
        .neq("scan_id", scanId);

      return { personId: existing.id, priorScanCount: count ?? 0 };
    }

    const { data: created } = await this.client
      .from("people")
      .insert({
        department,
        name,
        owner_user_id: userId,
        title,
      })
      .select("id")
      .single();

    return { personId: created?.id ?? null, priorScanCount: 0 };
  }
}

function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email?.includes("@")) {
    return null;
  }

  return email.split("@")[1]?.toLowerCase() ?? null;
}

function computeStatus(
  name: string,
  company: string | null,
  emailDomain: string | null,
  priorScanCount: number,
): IdentityStatus {
  if (priorScanCount > 0) {
    return "high_confidence";
  }

  if (emailDomain && company) {
    const companyRoot = company.split(/\s+/)[0]?.toLowerCase() ?? "";

    if (companyRoot.length >= 3 && emailDomain.includes(companyRoot)) {
      return "high_confidence";
    }
  }

  if (name && company) {
    return "medium_confidence";
  }

  return "unresolved";
}

// Reads the resolved identity_status for a scan by joining business_cards → people.
// Returns null if the card has no linked person (identity resolution not yet run
// or person creation failed).
export async function getResolvedIdentityStatus(
  client: SupabaseClient<Database>,
  scanId: string,
): Promise<IdentityStatus | null> {
  const { data: card } = await client
    .from("business_cards")
    .select("person_id")
    .eq("scan_id", scanId)
    .maybeSingle();

  if (!card?.person_id) {
    return null;
  }

  const { data: person } = await client
    .from("people")
    .select("identity_status")
    .eq("id", card.person_id)
    .maybeSingle();

  if (!person) {
    return null;
  }

  const parsed = identityStatusSchema.safeParse(person.identity_status);

  return parsed.success ? parsed.data : null;
}
