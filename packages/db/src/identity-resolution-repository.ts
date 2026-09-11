import {
  assessCardIdentity,
  emailDomainOf,
  identityStatusSchema,
  normalizePersonName,
  type IdentityStatus,
} from "@miraio/domain";
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

type EmbeddedPerson = { name: string } | { name: string }[] | null;

function embeddedPersonName(person: EmbeddedPerson): string | null {
  const row = Array.isArray(person) ? person[0] : person;

  return row?.name ?? null;
}

export class IdentityResolutionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  // Resolves the identity of the person on a scanned card by linking the card
  // to user-scoped people and organizations records. Returns the computed
  // IdentityStatus, which is also written to people.identity_status so Flash
  // Brief can read it as a confidence floor via business_cards.person_id.
  //
  // Safe to run again for the same scan: a resumed pipeline does, and it must
  // neither create a second person nor count the scan as its own prior sighting.
  async resolve(scanId: string, userId: string): Promise<IdentityStatus> {
    const { data: card, error: cardError } = await this.client
      .from("business_cards")
      .select("name,company,title,department,email,person_id,organization_id")
      .eq("scan_id", scanId)
      .maybeSingle();

    const name = card?.name?.trim();

    if (cardError || !card || !name) {
      return "unresolved";
    }

    const company = card.company?.trim() || null;
    const emailDomain = emailDomainOf(card.email);
    const organizationId = await this.upsertOrganization(
      userId,
      company,
      emailDomain,
    );
    const previousSighting = organizationId
      ? await this.findPersonAtOrganization(organizationId, scanId, name)
      : null;
    const personId =
      previousSighting ??
      (await this.reuseLinkedPerson(card.person_id, name)) ??
      (await this.createPerson(userId, name, card.title, card.department));

    await this.client
      .from("business_cards")
      .update({ organization_id: organizationId, person_id: personId })
      .eq("scan_id", scanId);

    // A corrected card can move to another person or organization; the ones it
    // left behind must not keep a copy of card data no scan refers to anymore.
    if (card.person_id && card.person_id !== personId) {
      await removeOrphanedIdentityRecords(this.client, {
        organizationId: null,
        personId: card.person_id,
      });
    }

    if (card.organization_id && card.organization_id !== organizationId) {
      await removeOrphanedIdentityRecords(this.client, {
        organizationId: card.organization_id,
        personId: null,
      });
    }

    const status = assessCardIdentity({
      company,
      emailDomain,
      name,
      seenAtSameOrganization: previousSighting !== null,
    });

    if (personId) {
      await this.client
        .from("people")
        .update({ identity_status: status })
        .eq("id", personId);
    }

    return status;
  }

  // Organizations are matched on their exact name. A pattern match (the
  // previous `ilike`) treated `%` and `_` in OCR output as wildcards, and a
  // wrong organization match feeds straight into a wrong person match.
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
      .eq("name", company)
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

  // A person counts as seen before only when another of the user's cards at
  // the same organization carries the same name. Matching on the name alone
  // merged same-name people at different companies and then reported the
  // stranger as high confidence — exactly the wrong-person case the pilot
  // guardrail forbids.
  private async findPersonAtOrganization(
    organizationId: string,
    scanId: string,
    name: string,
  ): Promise<string | null> {
    const { data: rows, error } = await this.client
      .from("business_cards")
      .select("person_id,people(name)")
      .eq("organization_id", organizationId)
      .neq("scan_id", scanId)
      .not("person_id", "is", null);

    if (error) {
      return null;
    }

    const target = normalizePersonName(name);
    const match = (rows ?? []).find((row) => {
      const personName = embeddedPersonName(row.people as EmbeddedPerson);

      return personName !== null && normalizePersonName(personName) === target;
    });

    return match?.person_id ?? null;
  }

  private async reuseLinkedPerson(
    personId: string | null,
    name: string,
  ): Promise<string | null> {
    if (!personId) {
      return null;
    }

    const { data: person } = await this.client
      .from("people")
      .select("name")
      .eq("id", personId)
      .maybeSingle();

    return person &&
      normalizePersonName(person.name) === normalizePersonName(name)
      ? personId
      : null;
  }

  private async createPerson(
    userId: string,
    name: string,
    title: string | null,
    department: string | null,
  ): Promise<string | null> {
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

    return created?.id ?? null;
  }
}

/**
 * Deletes a person or organization row once no business card links to it.
 *
 * These rows copy the name, title and company from the card, so after the
 * last scan that produced them is deleted they are card data the user can no
 * longer see or remove. Best effort: a failure leaves the row for the next
 * deletion that touches it, and never fails the caller.
 */
export async function removeOrphanedIdentityRecords(
  client: SupabaseClient<Database>,
  links: Readonly<{ organizationId: string | null; personId: string | null }>,
): Promise<void> {
  try {
    if (links.personId) {
      const { count, error } = await client
        .from("business_cards")
        .select("id", { count: "exact", head: true })
        .eq("person_id", links.personId);

      if (!error && count === 0) {
        await client.from("people").delete().eq("id", links.personId);
      }
    }

    if (links.organizationId) {
      const { count, error } = await client
        .from("business_cards")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", links.organizationId);

      if (!error && count === 0) {
        await client
          .from("organizations")
          .delete()
          .eq("id", links.organizationId);
      }
    }
  } catch {
    // Deliberately swallowed; see above.
  }
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
