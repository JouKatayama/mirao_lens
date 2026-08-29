import { z } from "zod";

// ─── Source type ──────────────────────────────────────────────────────────────

export const evidenceSourceTypeSchema = z.enum([
  "business_card",
  "user_correction",
  "official_company",
  "public_web",
  "user_context",
  "ai_inference",
]);

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;

// ─── Single evidence item ─────────────────────────────────────────────────────

export const evidenceItemSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    excerpt: z.string().nullable(),
    id: z.string().uuid(),
    retrieved_at: z.string().nullable(),
    source_title: z.string().nullable(),
    source_type: evidenceSourceTypeSchema,
    source_url: z.string().nullable(),
  })
  .strict();

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

// ─── API response ─────────────────────────────────────────────────────────────

export const evidenceListResponseSchema = z
  .object({
    items: z.array(evidenceItemSchema),
    scan_id: z.string().uuid(),
  })
  .strict();

export type EvidenceListResponse = z.infer<typeof evidenceListResponseSchema>;
