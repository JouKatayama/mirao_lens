import { z } from "zod";

export const noteRequestSchema = z
  .object({
    note_text: z.string().min(1).max(4000),
  })
  .strict();

export const nextActionRequestSchema = z
  .object({
    action_text: z.string().min(1).max(2000),
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
