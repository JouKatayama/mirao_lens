import { z } from "zod";

import { meetingGoalSchema } from "../scan/card-scan";

// A scan of the same person, before the scan being viewed. Identity resolution
// already reuses a `people` row across scans, so the history is a read over
// data the pipeline records — nothing new is inferred here.
export const encounterHistoryItemSchema = z
  .object({
    created_at: z.string().min(1),
    meeting_goal: meetingGoalSchema,
    note_excerpt: z.string().nullable(),
    scan_id: z.string().uuid(),
  })
  .strict();

export const encounterHistoryResponseSchema = z
  .object({
    items: z.array(encounterHistoryItemSchema),
    scan_id: z.string().uuid(),
  })
  .strict();

export type EncounterHistoryItem = z.infer<typeof encounterHistoryItemSchema>;
export type EncounterHistoryResponse = z.infer<
  typeof encounterHistoryResponseSchema
>;

export const encounterNoteExcerptLength = 120;

// The note is shown as a reminder of the last conversation, not as the note
// itself, so it is cut to a single readable line.
export function toEncounterNoteExcerpt(
  noteText: string | null | undefined,
): string | null {
  if (!noteText) return null;

  const collapsed = noteText.replace(/\s+/g, " ").trim();
  if (collapsed === "") return null;

  return collapsed.length > encounterNoteExcerptLength
    ? `${collapsed.slice(0, encounterNoteExcerptLength)}…`
    : collapsed;
}

// "この人とは3回目" counts the scan being viewed as well.
export function toEncounterOrdinal(previousEncounters: number): number {
  return Math.max(0, previousEncounters) + 1;
}
