import {
  companyContextSchema,
  flashBriefSchema,
  mutualValueSchema,
  type FlashBrief,
  type MeetingGoal,
  type MutualValue,
  type MutualValueInput,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

export type MutualValueRepositoryErrorCode = "database_error" | "not_found";

export class MutualValueRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: MutualValueRepositoryErrorCode = "database_error",
  ) {
    super(`Mutual Value persistence failed: ${operation}.`);
    this.name = "MutualValueRepositoryError";
  }
}

export type MutualValueClaim = Readonly<{
  runId: string;
}>;

export type AuthenticatedMutualValueSession = Readonly<{
  repository: MutualValueRepository;
  userId: string;
}>;

export async function authenticateMutualValueSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedMutualValueSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new MutualValueRepository(client),
    userId: data.user.id,
  };
}

export class MutualValueRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async claimMutualValue(
    scanId: string,
    provider: string,
    modelAlias: string,
  ): Promise<MutualValueClaim | null> {
    const { data, error } = await this.client.rpc("claim_mutual_value", {
      p_model_alias: modelAlias,
      p_provider: provider,
      p_scan_id: scanId,
    });

    if (error) {
      throw new MutualValueRepositoryError("claim_mutual_value");
    }

    const claim = data[0];

    return claim ? { runId: claim.run_id } : null;
  }

  async completeMutualValue(
    scanId: string,
    runId: string,
    mutualValue: MutualValue,
    latencyMs: number,
  ): Promise<void> {
    const { data, error } = await this.client.rpc("persist_mutual_value", {
      p_latency_ms: latencyMs,
      p_mutual_value_json: mutualValue as unknown as Json,
      p_run_id: runId,
      p_scan_id: scanId,
    });

    if (error) {
      throw new MutualValueRepositoryError("complete_mutual_value");
    }

    if (!data[0]) {
      throw new MutualValueRepositoryError(
        "complete_mutual_value",
        "not_found",
      );
    }
  }

  async failMutualValue(
    scanId: string,
    runId: string,
    errorCode: string,
  ): Promise<void> {
    const { data, error } = await this.client.rpc("fail_mutual_value", {
      p_error_code: errorCode,
      p_run_id: runId,
      p_scan_id: scanId,
    });

    if (error || !data) {
      throw new MutualValueRepositoryError("fail_mutual_value");
    }
  }

  // Fetches all inputs needed for Mutual Value generation (card, flash_brief,
  // personal context, meeting goal, profile, company context). Returns null
  // when the scan is not found or does not belong to the authenticated user.
  async getMutualValueInput(scanId: string): Promise<MutualValueInput | null> {
    const [
      scanResult,
      cardResult,
      profileResult,
      contextResult,
      analysisResult,
    ] = await Promise.all([
      this.client
        .from("scans")
        .select("meeting_goal")
        .eq("id", scanId)
        .maybeSingle(),
      this.client
        .from("business_cards")
        .select("name,company,department,title,language,email,phone,website")
        .eq("scan_id", scanId)
        .maybeSingle(),
      this.client
        .from("profiles")
        .select("current_role,current_company")
        .maybeSingle(),
      this.client
        .from("personal_context_items")
        .select("type,text,tags")
        .eq("user_approved", true)
        .order("updated_at", { ascending: false }),
      this.client
        .from("relationship_analyses")
        .select("flash_brief_json,company_context_json")
        .eq("scan_id", scanId)
        .maybeSingle(),
    ]);

    if (
      scanResult.error ||
      cardResult.error ||
      profileResult.error ||
      contextResult.error ||
      analysisResult.error
    ) {
      throw new MutualValueRepositoryError("get_input");
    }

    if (!scanResult.data || !cardResult.data) {
      return null;
    }

    const flashBriefParsed = analysisResult.data?.flash_brief_json
      ? flashBriefSchema.safeParse(analysisResult.data.flash_brief_json)
      : null;

    if (!flashBriefParsed?.success) {
      return null;
    }

    const flashBrief: FlashBrief = flashBriefParsed.data;
    const card = cardResult.data;
    const profile = profileResult.data;
    const items = (contextResult.data ?? []).map((item) => ({
      tags: item.tags,
      text: item.text,
      type: item.type as MutualValueInput["personal_context"]["items"][number]["type"],
    }));

    const companyContextRaw = analysisResult.data?.company_context_json;
    const companyContextParsed = companyContextRaw
      ? companyContextSchema.safeParse(companyContextRaw)
      : null;
    const companyContext =
      companyContextParsed?.success ? companyContextParsed.data : null;

    return {
      card: {
        company: card.company,
        department: card.department,
        email: card.email ?? null,
        language: card.language,
        name: card.name,
        phone: card.phone ?? null,
        title: card.title,
        website: card.website ?? null,
      },
      company_context: companyContext,
      flash_brief: flashBrief,
      locale: "ja",
      meeting_goal: scanResult.data.meeting_goal as MeetingGoal,
      personal_context: {
        current_company: profile?.current_company ?? null,
        current_role: profile?.current_role ?? null,
        items,
      },
    };
  }

  // Reads the scan's evidence records and assigns evidence_ids to give/get
  // items based on claim_type:
  //   fact      → business_card evidence (card-derived claims)
  //   hypothesis → ai_inference evidence (AI-generated inferences)
  async linkEvidenceIds(
    scanId: string,
    mutualValue: MutualValue,
  ): Promise<MutualValue> {
    const { data: rows } = await this.client
      .from("evidence")
      .select("id,source_type")
      .eq("scan_id", scanId);

    if (!rows || rows.length === 0) {
      return mutualValue;
    }

    const cardEvidenceId =
      rows.find((r) => r.source_type === "business_card")?.id ?? null;
    const aiEvidenceId =
      rows.find((r) => r.source_type === "ai_inference")?.id ?? null;

    function assignIds(
      items: MutualValue["give"],
    ): MutualValue["give"] {
      return items.map((item) => ({
        ...item,
        evidence_ids:
          item.claim_type === "fact" && cardEvidenceId
            ? [cardEvidenceId]
            : item.claim_type === "hypothesis" && aiEvidenceId
              ? [aiEvidenceId]
              : item.evidence_ids,
      }));
    }

    return {
      ...mutualValue,
      get: assignIds(mutualValue.get),
      give: assignIds(mutualValue.give),
    };
  }

  async loadMutualValue(scanId: string): Promise<MutualValue | null> {
    const { data, error } = await this.client
      .from("relationship_analyses")
      .select("mutual_value_json")
      .eq("scan_id", scanId)
      .maybeSingle();

    if (error) {
      throw new MutualValueRepositoryError("load_mutual_value");
    }

    if (!data || !data.mutual_value_json) {
      return null;
    }

    const parsed = mutualValueSchema.safeParse(data.mutual_value_json);

    return parsed.success ? parsed.data : null;
  }
}
