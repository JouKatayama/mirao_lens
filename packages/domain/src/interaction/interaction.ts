import { z } from "zod";

export const noteRequestSchema = z
  .object({
    note_text: z.string().min(1).max(4000),
  })
  .strict();

export const nextActionRequestSchema = z
  .object({
    action_text: z.string().min(1).max(2000),
    // The moment a reminder can be set for. `timing_text` keeps the wording
    // the user read ("3日以内"), which schedules nothing on its own.
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
    source: z.enum(["ai", "user"]),
    status: z.enum(["accepted", "dismissed"]).default("accepted"),
    timing_text: z.string().max(200).nullable().optional(),
  })
  .strict();

// An action that was accepted is a promise; recording what became of it is
// what turns a saved next action into outcome data.
export const nextActionOutcomeStatuses = [
  "accepted",
  "dismissed",
  "completed",
] as const;

export const nextActionOutcomeStatusSchema = z.enum(nextActionOutcomeStatuses);

export const nextActionStatusUpdateRequestSchema = z
  .object({
    action_id: z.string().uuid(),
    status: nextActionOutcomeStatusSchema,
  })
  .strict();

/**
 * The reminder for an action that already exists.
 *
 * The moment could only be chosen as the action was written, so a user who
 * decided afterwards that they did want reminding had no way to say so. A null
 * due moment is "リマインドしない", chosen after the fact.
 */
export const nextActionDueUpdateRequestSchema = z
  .object({
    action_id: z.string().uuid(),
    due_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

/**
 * The two things a PATCH can change about a next action. Both are strict and
 * name different fields, so a body belongs to exactly one of them: a client
 * cannot settle an action and re-time it in the same ambiguous request.
 */
export const nextActionUpdateRequestSchema = z.union([
  nextActionStatusUpdateRequestSchema,
  nextActionDueUpdateRequestSchema,
]);

export function isNextActionDueUpdate(
  update: NextActionUpdateRequest,
): update is NextActionDueUpdateRequest {
  return "due_at" in update;
}

export const interactionNoteResponseSchema = z
  .object({
    id: z.string().uuid(),
    note_text: z.string(),
    scan_id: z.string().uuid(),
  })
  .strict();

// The note the user already saved for a scan, or null when there is none.
// Saving upserts, so a client that cannot read the stored note back would
// overwrite it with whatever it sends next.
export const interactionNoteReadResponseSchema = z
  .object({
    note_text: z.string().nullable(),
    scan_id: z.string().uuid(),
  })
  .strict();

export const nextActionResponseSchema = z
  .object({
    action_text: z.string(),
    due_at: z.string().nullable().default(null),
    id: z.string().uuid(),
    scan_id: z.string().uuid(),
    source: z.enum(["ai", "user"]),
    status: z.enum(["suggested", "accepted", "dismissed", "completed"]),
    timing_text: z.string().nullable(),
  })
  .strict();

export const nextActionListResponseSchema = z
  .object({
    items: z.array(nextActionResponseSchema),
    scan_id: z.string().uuid(),
  })
  .strict();

export type NextActionOutcomeStatus = z.infer<
  typeof nextActionOutcomeStatusSchema
>;
export type NextActionStatusUpdateRequest = z.infer<
  typeof nextActionStatusUpdateRequestSchema
>;
export type NextActionDueUpdateRequest = z.infer<
  typeof nextActionDueUpdateRequestSchema
>;
export type NextActionUpdateRequest = z.infer<
  typeof nextActionUpdateRequestSchema
>;
export type NextActionListResponse = z.infer<
  typeof nextActionListResponseSchema
>;
export type NoteRequest = z.infer<typeof noteRequestSchema>;
export type NextActionRequest = z.infer<typeof nextActionRequestSchema>;
export type InteractionNoteResponse = z.infer<
  typeof interactionNoteResponseSchema
>;
export type InteractionNoteReadResponse = z.infer<
  typeof interactionNoteReadResponseSchema
>;
export type NextActionResponse = z.infer<typeof nextActionResponseSchema>;
