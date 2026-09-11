import {
  encounterHistoryItemSchema,
  toEncounterNoteExcerpt,
  type EncounterHistoryItem,
  type MeetingGoal,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

export class EncounterHistoryRepositoryError extends Error {
  constructor(readonly operation: string) {
    super(`Encounter history read failed: ${operation}.`);
    this.name = "EncounterHistoryRepositoryError";
  }
}

export type AuthenticatedEncounterHistorySession = Readonly<{
  repository: EncounterHistoryRepository;
  userId: string;
}>;

export async function authenticateEncounterHistorySession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedEncounterHistorySession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new EncounterHistoryRepository(client),
    userId: data.user.id,
  };
}

// A person met at an event and then again at a meeting is the same `people`
// row, so earlier encounters are found through the person the current scan's
// card resolved to. Every table here is user-scoped and RLS-protected, so the
// query cannot cross into another user's scans.
export const encounterHistoryLimit = 20;

export class EncounterHistoryRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getEncountersForScan(scanId: string): Promise<EncounterHistoryItem[]> {
    const { data: card, error: cardError } = await this.client
      .from("business_cards")
      .select("person_id")
      .eq("scan_id", scanId)
      .maybeSingle();

    if (cardError) {
      throw new EncounterHistoryRepositoryError("get_current_card");
    }

    // No resolved person means no way to claim two cards are the same human.
    // An empty history is the honest answer, not a guess by name.
    if (!card?.person_id) {
      return [];
    }

    const { data: siblings, error: siblingError } = await this.client
      .from("business_cards")
      .select("scan_id")
      .eq("person_id", card.person_id)
      .neq("scan_id", scanId);

    if (siblingError) {
      throw new EncounterHistoryRepositoryError("get_sibling_cards");
    }

    const scanIds = (siblings ?? [])
      .map((row) => row.scan_id)
      .filter((value): value is string => value !== null);

    if (scanIds.length === 0) {
      return [];
    }

    const [scanResult, noteResult] = await Promise.all([
      this.client
        .from("scans")
        .select("id,created_at,meeting_goal")
        .in("id", scanIds)
        .order("created_at", { ascending: false })
        .limit(encounterHistoryLimit),
      this.client
        .from("interaction_notes")
        .select("scan_id,note_text")
        .in("scan_id", scanIds),
    ]);

    if (scanResult.error || noteResult.error) {
      throw new EncounterHistoryRepositoryError("get_encounters");
    }

    const notesByScan = new Map(
      (noteResult.data ?? []).map((row) => [row.scan_id, row.note_text]),
    );

    return (scanResult.data ?? []).map((row) =>
      encounterHistoryItemSchema.parse({
        created_at: row.created_at,
        meeting_goal: row.meeting_goal as MeetingGoal,
        note_excerpt: toEncounterNoteExcerpt(notesByScan.get(row.id)),
        scan_id: row.id,
      }),
    );
  }
}
