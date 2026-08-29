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
      p_timing_text: timingText ?? null,
    });

    if (error) {
      throw new InteractionRepositoryError("create_next_action");
    }

    const row = data[0];

    return row ? { id: row.action_id } : null;
  }
}
