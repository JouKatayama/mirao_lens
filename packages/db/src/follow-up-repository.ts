import {
  connectionTypeSchema,
  followUpRecommendationSchema,
  mutualValueSchema,
  type FollowUpDecisionRequest,
  type FollowUpDraft,
  type FollowUpInput,
  type FollowUpJudgement,
  type FollowUpRecommendation,
  type MeetingGoal,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";
import { RelationshipGraphRepository } from "./relationship-graph-repository";

export class FollowUpRepositoryError extends Error {
  constructor(readonly operation: string) {
    super(`Follow-up persistence failed: ${operation}.`);
    this.name = "FollowUpRepositoryError";
  }
}

export type AuthenticatedFollowUpSession = Readonly<{
  repository: FollowUpRepository;
  userId: string;
}>;

export async function authenticateFollowUpSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedFollowUpSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new FollowUpRepository(client, data.user.id),
    userId: data.user.id,
  };
}

export type FollowUpModelMetadata = Readonly<{
  draft_status: "generated" | "failed" | "not_requested";
  latency_ms: number;
  model_alias: string;
  provider: string;
}>;

const recommendationColumns =
  "id,scan_id,decision,confidence,reasons_json,uncertainty,timing_text,draft_subject,draft_body,status,edited,generated_at,decided_at";

type RecommendationRow = Readonly<{
  confidence: number;
  decided_at: string | null;
  decision: string;
  draft_body: string | null;
  draft_subject: string | null;
  edited: boolean;
  generated_at: string;
  id: string;
  reasons_json: Json;
  scan_id: string;
  status: string;
  timing_text: string | null;
  uncertainty: string | null;
}>;

export class FollowUpRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  /**
   * Everything the judgement may weigh, read under the user's own session.
   * Null when the scan or its card does not exist (or is not the user's).
   */
  async getFollowUpInput(scanId: string): Promise<FollowUpInput | null> {
    const [
      scanResult,
      cardResult,
      noteResult,
      actionResult,
      analysisResult,
      profileResult,
      contextResult,
    ] = await Promise.all([
      this.client
        .from("scans")
        .select("meeting_goal")
        .eq("id", scanId)
        .maybeSingle(),
      this.client
        .from("business_cards")
        .select("name,company,title,person_id")
        .eq("scan_id", scanId)
        .maybeSingle(),
      this.client
        .from("interaction_notes")
        .select("note_text")
        .eq("scan_id", scanId)
        .maybeSingle(),
      this.client
        .from("next_actions")
        .select("action_text,status")
        .eq("scan_id", scanId)
        .order("created_at", { ascending: true }),
      this.client
        .from("relationship_analyses")
        .select("mutual_value_json")
        .eq("scan_id", scanId)
        .maybeSingle(),
      this.client
        .from("profiles")
        .select("current_role,current_company")
        .maybeSingle(),
      this.client
        .from("personal_context_items")
        .select("type,text")
        .eq("user_approved", true)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    if (
      scanResult.error ||
      cardResult.error ||
      noteResult.error ||
      actionResult.error ||
      analysisResult.error ||
      profileResult.error ||
      contextResult.error
    ) {
      throw new FollowUpRepositoryError("get_input");
    }

    if (!scanResult.data || !cardResult.data) {
      return null;
    }

    const personId = cardResult.data.person_id;
    let previousEncounterCount = 0;
    let connections: FollowUpInput["connections"] = [];

    if (personId) {
      const { count, error } = await this.client
        .from("business_cards")
        .select("scan_id", { count: "exact", head: true })
        .eq("person_id", personId)
        .neq("scan_id", scanId);

      if (error) {
        throw new FollowUpRepositoryError("count_encounters");
      }

      previousEncounterCount = count ?? 0;
      const named = await new RelationshipGraphRepository(
        this.client,
        this.userId,
      ).listApprovedConnectionNames(personId);
      connections = named.flatMap((item) => {
        const parsed = connectionTypeSchema.safeParse(item.connection_type);
        return parsed.success
          ? [{ connection_type: parsed.data, name: item.name }]
          : [];
      });
    }

    const mutualValue = mutualValueSchema.safeParse(
      analysisResult.data?.mutual_value_json,
    );

    return {
      card: {
        company: cardResult.data.company,
        name: cardResult.data.name,
        title: cardResult.data.title,
      },
      connections,
      locale: "ja",
      meeting_goal: scanResult.data.meeting_goal as MeetingGoal,
      mutual_value: mutualValue.success
        ? {
            bridge: mutualValue.data.bridge,
            next_action: mutualValue.data.next_action.action,
          }
        : null,
      next_actions: (actionResult.data ?? []).map((row) => ({
        action_text: row.action_text,
        status: row.status as FollowUpInput["next_actions"][number]["status"],
      })),
      note: noteResult.data?.note_text ?? null,
      personal_context: {
        current_company: profileResult.data?.current_company ?? null,
        current_role: profileResult.data?.current_role ?? null,
        items: (contextResult.data ?? []).map((row) => ({
          text: row.text,
          type: row.type as FollowUpInput["personal_context"]["items"][number]["type"],
        })),
      },
      previous_encounter_count: previousEncounterCount,
    };
  }

  async getRecommendation(
    scanId: string,
  ): Promise<FollowUpRecommendation | null> {
    const [recommendationResult, cardResult] = await Promise.all([
      this.client
        .from("follow_up_recommendations")
        .select(recommendationColumns)
        .eq("scan_id", scanId)
        .maybeSingle(),
      this.client
        .from("business_cards")
        .select("email")
        .eq("scan_id", scanId)
        .maybeSingle(),
    ]);

    if (recommendationResult.error || cardResult.error) {
      throw new FollowUpRepositoryError("get_recommendation");
    }

    return recommendationResult.data
      ? toRecommendation(
          recommendationResult.data,
          cardResult.data?.email ?? null,
        )
      : null;
  }

  /**
   * Stores a fresh judgement. Judging again replaces the previous one and
   * returns it to `suggested`: the user decides on what is in front of them.
   */
  async saveRecommendation(
    scanId: string,
    judgement: FollowUpJudgement,
    draft: FollowUpDraft | null,
    metadata: FollowUpModelMetadata,
  ): Promise<FollowUpRecommendation> {
    const now = new Date().toISOString();
    const keepsDraft = judgement.decision === "follow_up" && draft !== null;
    const { error } = await this.client
      .from("follow_up_recommendations")
      .upsert(
        {
          confidence: judgement.confidence,
          decided_at: null,
          decision: judgement.decision,
          draft_body: keepsDraft ? draft.body : null,
          draft_subject: keepsDraft ? draft.subject : null,
          edited: false,
          generated_at: now,
          model_metadata_json: metadata as unknown as Json,
          reasons_json: judgement.reasons as unknown as Json,
          scan_id: scanId,
          status: "suggested",
          timing_text: judgement.timing,
          uncertainty: judgement.uncertainty,
          updated_at: now,
          user_id: this.userId,
        },
        { onConflict: "scan_id" },
      );

    if (error) {
      throw new FollowUpRepositoryError("save_recommendation");
    }

    const saved = await this.getRecommendation(scanId);

    if (!saved) {
      throw new FollowUpRepositoryError("save_recommendation");
    }

    return saved;
  }

  /**
   * Records the user's decision. Approval may carry the draft as the user
   * edited it. Nothing is sent: the device hands the draft off.
   */
  async decide(
    scanId: string,
    request: FollowUpDecisionRequest,
  ): Promise<FollowUpRecommendation | null> {
    const current = await this.getRecommendation(scanId);

    if (!current) {
      return null;
    }

    const now = new Date().toISOString();
    const update: Database["public"]["Tables"]["follow_up_recommendations"]["Update"] =
      { decided_at: now, status: request.status, updated_at: now };

    if (
      request.status === "approved" &&
      request.draft &&
      current.decision === "follow_up"
    ) {
      update.draft_subject = request.draft.subject;
      update.draft_body = request.draft.body;
      update.edited =
        current.edited ||
        current.draft === null ||
        current.draft.subject !== request.draft.subject ||
        current.draft.body !== request.draft.body;
    }

    const { error } = await this.client
      .from("follow_up_recommendations")
      .update(update)
      .eq("scan_id", scanId);

    if (error) {
      throw new FollowUpRepositoryError("decide");
    }

    return this.getRecommendation(scanId);
  }
}

function toRecommendation(
  row: RecommendationRow,
  recipientEmail: string | null,
): FollowUpRecommendation {
  const reasons = followUpRecommendationSchema.shape.reasons.safeParse(
    row.reasons_json,
  );

  return followUpRecommendationSchema.parse({
    confidence: row.confidence,
    decided_at: row.decided_at,
    decision: row.decision,
    draft:
      row.draft_subject !== null && row.draft_body !== null
        ? { body: row.draft_body, subject: row.draft_subject }
        : null,
    edited: row.edited,
    generated_at: row.generated_at,
    id: row.id,
    reasons: reasons.success ? reasons.data : [],
    recipient_email: recipientEmail,
    scan_id: row.scan_id,
    status: row.status,
    timing: row.timing_text,
    uncertainty: row.uncertainty,
  });
}
