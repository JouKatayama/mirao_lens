import {
  nextActionResponseSchema,
  type NextActionOutcomeStatus,
  type NextActionResponse,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

export type InteractionRepositoryErrorCode = "database_error" | "not_found";

export class InteractionRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: InteractionRepositoryErrorCode = "database_error",
  ) {
    super(`Interaction persistence failed: ${operation}.`);
    this.name = "InteractionRepositoryError";
  }
}

export type AuthenticatedInteractionSession = Readonly<{
  repository: InteractionRepository;
  userId: string;
}>;

export async function authenticateInteractionSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedInteractionSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new InteractionRepository(client),
    userId: data.user.id,
  };
}

export class InteractionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async upsertNote(
    scanId: string,
    noteText: string,
  ): Promise<{ id: string } | null> {
    const { data, error } = await this.client.rpc("upsert_interaction_note", {
      p_note_text: noteText,
      p_scan_id: scanId,
    });

    if (error) {
      throw new InteractionRepositoryError("upsert_note");
    }

    const row = data[0];

    return row ? { id: row.note_id } : null;
  }

  // Both reads go through the caller's RLS scope, so another user's scan is
  // indistinguishable from a missing one and comes back as null.
  async getNote(scanId: string): Promise<{ note_text: string | null } | null> {
    const [scanResult, noteResult] = await Promise.all([
      this.client.from("scans").select("id").eq("id", scanId).maybeSingle(),
      this.client
        .from("interaction_notes")
        .select("note_text")
        .eq("scan_id", scanId)
        .maybeSingle(),
    ]);

    if (scanResult.error || noteResult.error) {
      throw new InteractionRepositoryError("get_note");
    }

    if (!scanResult.data) {
      return null;
    }

    return { note_text: noteResult.data?.note_text ?? null };
  }

  async createNextAction(
    scanId: string,
    actionText: string,
    timingText: string | null,
    source: "ai" | "user",
    status: "accepted" | "dismissed",
  ): Promise<{ id: string } | null> {
    const { data, error } = await this.client.rpc("create_next_action", {
      p_action_text: actionText,
      p_scan_id: scanId,
      p_source: source,
      p_status: status,
      // Generated RPC arguments are always non-null, but create_next_action
      // declares p_timing_text as plain nullable text and writes it straight
      // into next_actions.timing_text, so null is a value the function expects.
      p_timing_text: timingText as string,
    });

    if (error) {
      throw new InteractionRepositoryError("create_next_action");
    }

    const row = data[0];

    return row ? { id: row.action_id } : null;
  }

  async listNextActions(scanId: string): Promise<NextActionResponse[]> {
    const { data, error } = await this.client
      .from("next_actions")
      .select("id,scan_id,action_text,timing_text,source,status")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new InteractionRepositoryError("list_next_actions");
    }

    return (data ?? []).map((row) => nextActionResponseSchema.parse(row));
  }

  // Settling an action is an update, so it cannot reuse create_next_action.
  // A null result means the action does not exist for this user; the caller
  // turns that into a 404 rather than reporting a write that never happened.
  async updateNextActionStatus(
    actionId: string,
    status: NextActionOutcomeStatus,
  ): Promise<{ id: string } | null> {
    const { data, error } = await this.client.rpc("update_next_action_status", {
      p_action_id: actionId,
      p_status: status,
    });

    if (error) {
      throw new InteractionRepositoryError("update_next_action_status");
    }

    const row = data[0];

    return row ? { id: row.action_id } : null;
  }
}
