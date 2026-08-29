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

export const interactionNoteResponseSchema = z
  .object({
    id: z.string().uuid(),
    note_text: z.string(),
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

export type NoteRequest = z.infer<typeof noteRequestSchema>;
export type NextActionRequest = z.infer<typeof nextActionRequestSchema>;
export type InteractionNoteResponse = z.infer<typeof interactionNoteResponseSchema>;
export type NextActionResponse = z.infer<typeof nextActionResponseSchema>;
