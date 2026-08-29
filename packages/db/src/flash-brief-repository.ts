import {
  companyContextSchema,
  flashBriefSchema,
  type FlashBrief,
  type FlashBriefInput,
  type MeetingGoal,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./database.types";
import { getResolvedIdentityStatus } from "./identity-resolution-repository";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

export type FlashBriefRepositoryErrorCode = "database_error" | "not_found";

export class FlashBriefRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: FlashBriefRepositoryErrorCode = "database_error",
  ) {
    super(`Flash Brief persistence failed: ${operation}.`);
    this.name = "FlashBriefRepositoryError";
  }
}

export type FlashBriefClaim = Readonly<{
  runId: string;
}>;

export type AuthenticatedFlashBriefSession = Readonly<{
  repository: FlashBriefRepository;
  userId: string;
}>;

export async function authenticateFlashBriefSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedFlashBriefSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new FlashBriefRepository(client),
    userId: data.user.id,
  };
}

export class FlashBriefRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async claimBrief(
    scanId: string,
    provider: string,
    modelAlias: string,
  ): Promise<FlashBriefClaim | null> {
    const { data, error } = await this.client.rpc("claim_flash_brief", {
      p_model_alias: modelAlias,
      p_provider: provider,
      p_scan_id: scanId,
    });

    if (error) {
      throw new FlashBriefRepositoryError("claim_brief");
    }

    const claim = data[0];

    return claim ? { runId: claim.run_id } : null;
  }

  async completeBrief(
    scanId: string,
    runId: string,
    brief: FlashBrief,
    latencyMs: number,
  ): Promise<void> {
    const { data, error } = await this.client.rpc("persist_flash_brief", {
      p_brief_json: brief as unknown as Json,
      p_latency_ms: latencyMs,
      p_run_id: runId,
      p_scan_id: scanId,
    });

    if (error) {
      throw new FlashBriefRepositoryError("complete_brief");
    }

    if (!data[0]) {
      throw new FlashBriefRepositoryError("complete_brief", "not_found");
    }
  }

  async failBrief(
    scanId: string,
    runId: string,
    errorCode: string,
  ): Promise<void> {
    const { data, error } = await this.client.rpc("fail_flash_brief", {
      p_error_code: errorCode,
      p_run_id: runId,
      p_scan_id: scanId,
    });

    if (error || !data) {
      throw new FlashBriefRepositoryError("fail_brief");
    }
  }

  // Fetches all inputs needed for Flash Brief generation (card, personal
  // context, meeting goal, profile, company context, prior identity status).
  // Returns null when the scan is not found or does not belong to the
  // authenticated user.
  async getFlashBriefInput(scanId: string): Promise<FlashBriefInput | null> {
    const [
      scanResult,
      cardResult,
      profileResult,
      contextResult,
      analysisResult,
      priorIdentityStatus,
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
        .select("company_context_json")
        .eq("scan_id", scanId)
        .maybeSingle(),
      getResolvedIdentityStatus(this.client, scanId),
    ]);

    if (
      scanResult.error ||
      cardResult.error ||
      profileResult.error ||
      contextResult.error ||
      analysisResult.error
    ) {
      throw new FlashBriefRepositoryError("get_input");
    }

    if (!scanResult.data || !cardResult.data) {
      return null;
    }

    const card = cardResult.data;
    const profile = profileResult.data;
    const items = (contextResult.data ?? []).map((item) => ({
      tags: item.tags,
      text: item.text,
      type: item.type as FlashBriefInput["personal_context"]["items"][number]["type"],
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
        email: card.email,
        language: card.language,
        name: card.name,
        phone: card.phone,
        title: card.title,
        website: card.website,
      },
      company_context: companyContext,
      locale: "ja",
      meeting_goal: scanResult.data.meeting_goal as MeetingGoal,
      personal_context: {
        current_company: profile?.current_company ?? null,
        current_role: profile?.current_role ?? null,
        items,
      },
      prior_identity_status: priorIdentityStatus,
    };
  }

  async loadBrief(scanId: string): Promise<FlashBrief | null> {
    const { data, error } = await this.client
      .from("relationship_analyses")
      .select("flash_brief_json")
      .eq("scan_id", scanId)
      .maybeSingle();

    if (error) {
      throw new FlashBriefRepositoryError("load_brief");
    }

    if (!data || !data.flash_brief_json) {
      return null;
    }

    const parsed = flashBriefSchema.safeParse(data.flash_brief_json);

    return parsed.success ? parsed.data : null;
  }
}
