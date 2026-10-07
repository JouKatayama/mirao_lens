import { z } from "zod";

import { scanHistoryItemSchema } from "../scan/card-scan";

export const eventNameSchema = z.string().trim().min(1).max(120);

export const eventCreateRequestSchema = z
  .object({ name: eventNameSchema })
  .strict();

export const eventRecordSchema = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    name: eventNameSchema,
  })
  .strict();

export const eventListResponseSchema = z
  .object({ items: z.array(eventRecordSchema) })
  .strict();

export const eventScanAttachRequestSchema = z
  .object({ scan_id: z.string().uuid() })
  .strict();

export const eventScanListResponseSchema = z
  .object({ items: z.array(scanHistoryItemSchema) })
  .strict();

export type EventCreateRequest = z.infer<typeof eventCreateRequestSchema>;
export type EventRecord = z.infer<typeof eventRecordSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type EventScanAttachRequest = z.infer<
  typeof eventScanAttachRequestSchema
>;

export const eventMemberRequestSchema = z
  .object({
    member_user_id: z.string().uuid(),
  })
  .strict();

export const eventTeamItemSchema = z
  .object({
    scan_id: z.string().uuid(),
    card_name: z.string().nullable(),
    card_company: z.string().nullable(),
    card_title: z.string().nullable(),
    note_text: z.string().nullable(),
    action_text: z.string().nullable(),
    action_status: z.enum(["accepted", "completed"]).nullable(),
  })
  .strict();

export const eventTeamListResponseSchema = z
  .object({
    items: z.array(eventTeamItemSchema),
  })
  .strict();

export type EventTeamItem = z.infer<typeof eventTeamItemSchema>;
