import {
  classifyCompanySourceType,
  companyContextSchema,
  evidenceItemSchema,
  toPublicHttpUrl,
  toUrlHost,
  type EvidenceItem,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

const companyContextEvidenceTitle = "AI会社・役職分析";

// A page the model read is worth more than its own inference, and the
// company's own site is worth more than a third party writing about it.
const researchedSourceConfidence = {
  official_company: 0.7,
  public_web: 0.55,
} as const;

export class EvidenceRepositoryError extends Error {
  constructor(readonly operation: string) {
    super(`Evidence read failed: ${operation}.`);
    this.name = "EvidenceRepositoryError";
  }
}

export type AuthenticatedEvidenceSession = Readonly<{
  repository: EvidenceRepository;
  userId: string;
}>;

export async function authenticateEvidenceSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedEvidenceSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new EvidenceRepository(client),
    userId: data.user.id,
  };
}

export class EvidenceRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getEvidenceForScan(scanId: string): Promise<EvidenceItem[]> {
    const { data, error } = await this.client
      .from("evidence")
      .select(
        "id,source_type,source_title,source_url,retrieved_at,excerpt,confidence",
      )
      .eq("scan_id", scanId)
      .order("created_at");

    if (error) {
      throw new EvidenceRepositoryError("get_evidence");
    }

    return (data ?? []).map((row) => evidenceItemSchema.parse(row));
  }

  // Creates one business_card evidence record summarising the extracted fields.
  // Returns the created evidence ID, or null if the card row doesn't exist yet.
  async createCardEvidence(
    scanId: string,
    userId: string,
  ): Promise<string | null> {
    const { data: card } = await this.client
      .from("business_cards")
      .select("name,company,title,department,email,phone,field_confidence")
      .eq("scan_id", scanId)
      .maybeSingle();

    if (!card) {
      return null;
    }

    const fieldConf = card.field_confidence as Record<string, unknown>;
    const confidences = Object.values(fieldConf).filter(
      (v): v is number => typeof v === "number",
    );
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((sum, v) => sum + v, 0) / confidences.length
        : 0.85;

    const excerptParts = [
      card.name && `名前: ${card.name}`,
      card.company && `会社: ${card.company}`,
      card.title && `役職: ${card.title}`,
      card.department && `部署: ${card.department}`,
      card.email && `Email: ${card.email}`,
      card.phone && `電話: ${card.phone}`,
    ].filter((p): p is string => Boolean(p));

    const { data } = await this.client
      .from("evidence")
      .insert({
        confidence: Math.min(1, Math.max(0, avgConfidence)),
        excerpt: excerptParts.join(" / ") || null,
        retrieved_at: new Date().toISOString(),
        scan_id: scanId,
        source_title: card.name ?? card.company ?? "名刺",
        source_type: "business_card",
        source_url: null,
        user_id: userId,
      })
      .select("id")
      .single();

    return data?.id ?? null;
  }

  /**
   * Turns the pages the Company Context stage read into Evidence rows with
   * real source URLs. Until web research existed, `official_company` and
   * `public_web` were declared source types that nothing ever wrote, so every
   * claim in the product traced back to the card or to an inference.
   *
   * Returns the number of rows written.
   */
  async createCompanyWebEvidence(
    scanId: string,
    userId: string,
  ): Promise<number> {
    const [analysis, card] = await Promise.all([
      this.client
        .from("relationship_analyses")
        .select("company_context_json")
        .eq("scan_id", scanId)
        .maybeSingle(),
      this.client
        .from("business_cards")
        .select("website,email")
        .eq("scan_id", scanId)
        .maybeSingle(),
    ]);

    if (!analysis.data?.company_context_json) {
      return 0;
    }

    const parsed = companyContextSchema.safeParse(
      analysis.data.company_context_json,
    );

    if (!parsed.success) {
      return 0;
    }

    // A resumed scan researches again, so the rows of the earlier run are
    // replaced rather than listed twice beside the new ones.
    const { error: deleteError } = await this.client
      .from("evidence")
      .delete()
      .eq("scan_id", scanId)
      .in("source_type", ["official_company", "public_web"]);

    if (deleteError) {
      throw new EvidenceRepositoryError("replace_company_web_evidence");
    }

    const retrievedAt = new Date().toISOString();
    const rows = parsed.data.sources.flatMap((source) => {
      const url = toPublicHttpUrl(source.url);

      // A citation that is not a web link cannot be opened or checked, which
      // is the entire value of recording it.
      if (url === null) {
        return [];
      }

      const sourceType = classifyCompanySourceType(url, card.data ?? {});
      const title = source.title?.trim();

      return [
        {
          confidence: researchedSourceConfidence[sourceType],
          excerpt: title || url,
          retrieved_at: retrievedAt,
          scan_id: scanId,
          source_title: toUrlHost(url) ?? "web",
          source_type: sourceType,
          source_url: url,
          user_id: userId,
        },
      ];
    });

    if (rows.length === 0) {
      return 0;
    }

    const { error: insertError } = await this.client
      .from("evidence")
      .insert(rows);

    if (insertError) {
      throw new EvidenceRepositoryError("create_company_web_evidence");
    }

    return rows.length;
  }

  // Creates one ai_inference evidence record for company context.
  // Returns the created evidence ID, or null if company context is absent.
  async createCompanyContextEvidence(
    scanId: string,
    userId: string,
  ): Promise<string | null> {
    const { data: analysis } = await this.client
      .from("relationship_analyses")
      .select("company_context_json")
      .eq("scan_id", scanId)
      .maybeSingle();

    if (!analysis?.company_context_json) {
      return null;
    }

    const parsed = companyContextSchema.safeParse(
      analysis.company_context_json,
    );

    if (!parsed.success) {
      return null;
    }

    const ctx = parsed.data;
    const excerptParts = [
      ctx.company_description,
      ctx.industry && `業界: ${ctx.industry}`,
      ctx.role_scope && `役割: ${ctx.role_scope}`,
    ].filter((p): p is string => Boolean(p));

    // A resumed scan regenerates company context, so replace the record of the
    // earlier run rather than listing the same source twice.
    const { error: deleteError } = await this.client
      .from("evidence")
      .delete()
      .eq("scan_id", scanId)
      .eq("source_type", "ai_inference")
      .eq("source_title", companyContextEvidenceTitle);

    if (deleteError) {
      throw new EvidenceRepositoryError("replace_company_context_evidence");
    }

    const { data } = await this.client
      .from("evidence")
      .insert({
        confidence: 0.7,
        excerpt: excerptParts.join("\n") || null,
        retrieved_at: new Date().toISOString(),
        scan_id: scanId,
        source_title: companyContextEvidenceTitle,
        source_type: "ai_inference",
        source_url: null,
        user_id: userId,
      })
      .select("id")
      .single();

    return data?.id ?? null;
  }
}
