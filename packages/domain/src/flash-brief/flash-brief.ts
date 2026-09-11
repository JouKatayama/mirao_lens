import { z } from "zod";

import { businessCardPublicSchema } from "../card-intelligence/card-extraction";
import { companyContextSchema } from "../company-context/company-context";
import { personalContextTypeSchema } from "../context/personal-context";
import { mutualValuePublicSchema } from "../mutual-value/mutual-value";
import { meetingGoalSchema } from "../scan/card-scan";

// ─── Identity Resolution ──────────────────────────────────────────────────────

export const identityStatusSchema = z.enum([
  "verified",
  "high_confidence",
  "medium_confidence",
  "unresolved",
]);

export type IdentityStatus = z.infer<typeof identityStatusSchema>;

// ─── Claim labelling ─────────────────────────────────────────────────────────
//
// Mutual Value already labels every claim. The Flash Brief showed a hardcoded
// "hypothesis" badge instead, so the product's Fact / Hypothesis / Ask
// separation was cosmetic on the one screen the user reads first.

export const flashBriefClaimTypeSchema = z.enum(["fact", "hypothesis"]);

export type FlashBriefClaimType = z.infer<typeof flashBriefClaimTypeSchema>;

// POTENTIAL is an explainable product heuristic on a 1-5 scale, not an
// objective compatibility score (product spec 6.2).
export const potentialScoreSchema = z.number().int().min(1).max(5);

export const connectionKeywordSchema = z.string().min(1).max(24);

// ─── AI structured output (JSON-Schema-compatible for OpenAI strict mode) ────

export const flashBriefStructuredOutputSchema = z
  .object({
    connection_keywords: z.array(connectionKeywordSchema).min(1).max(4),
    identity_status: identityStatusSchema,
    potential: z.string().min(1).max(1000),
    potential_score: potentialScoreSchema,
    say_this: z.array(z.string().min(1).max(400)).min(1).max(3),
    who: z.string().min(1).max(1000),
    why_you: z.string().min(1).max(1000),
    why_you_claim_type: flashBriefClaimTypeSchema,
  })
  .strict();

// ─── Canonical (stored in DB as flash_brief_json) ────────────────────────────
// identity_status defaults to "unresolved" for backward compat with stored rows
// that pre-date ML-009.

export const flashBriefSchema = z
  .object({
    // The three fields below post-date ML-018 and default for briefs that were
    // stored before it. A legacy row keeps rendering: no score, no keywords,
    // and the hypothesis label the screen used to hardcode.
    connection_keywords: z
      .array(connectionKeywordSchema.trim())
      .max(4)
      .default([]),
    identity_status: identityStatusSchema.default("unresolved"),
    potential: z.string().trim().min(1).max(1000),
    potential_score: potentialScoreSchema.nullable().default(null),
    say_this: z.array(z.string().trim().min(1).max(400)).min(1).max(3),
    who: z.string().trim().min(1).max(1000),
    why_you: z.string().trim().min(1).max(1000),
    why_you_claim_type: flashBriefClaimTypeSchema.default("hypothesis"),
  })
  .strict();

export const flashBriefPublicSchema = flashBriefSchema;

// ─── Input for AI provider ────────────────────────────────────────────────────

export const flashBriefPersonalContextItemSchema = z
  .object({
    type: personalContextTypeSchema,
    text: z.string().min(1).max(4000),
    tags: z.array(z.string()),
  })
  .strict();

export const flashBriefInputSchema = z
  .object({
    card: z
      .object({
        company: z.string().nullable(),
        department: z.string().nullable(),
        email: z.string().nullable().optional(),
        language: z.string(),
        name: z.string().nullable(),
        phone: z.string().nullable().optional(),
        title: z.string().nullable(),
        website: z.string().nullable().optional(),
      })
      .strict(),
    company_context: companyContextSchema.nullable().optional(),
    locale: z.string().min(2).max(35).default("ja"),
    meeting_goal: meetingGoalSchema,
    personal_context: z
      .object({
        current_company: z.string().nullable(),
        current_role: z.string().nullable(),
        items: z.array(flashBriefPersonalContextItemSchema),
      })
      .strict(),
    // Resolved from people table cross-validation (ML-009). When set, the AI
    // must treat it as a confidence floor and never produce a lower status.
    prior_identity_status: identityStatusSchema.nullable().optional(),
  })
  .strict();

// ─── Extended scan status response ───────────────────────────────────────────
//
// This supersedes CardIntelligenceStatusResponse (which only covers the card
// extraction phase). All API handlers and mobile clients should migrate to
// ScanStatusResponse.

const extractingStatusSchema = z
  .object({
    card: z.null(),
    error_code: z.null(),
    flash_brief: z.null(),
    mutual_value: z.null(),
    scan_id: z.string().uuid(),
    status: z.literal("extracting"),
  })
  .strict();

const cardReadyStatusSchema = z
  .object({
    card: businessCardPublicSchema,
    error_code: z.null(),
    flash_brief: z.null(),
    mutual_value: z.null(),
    scan_id: z.string().uuid(),
    status: z.literal("card_ready"),
  })
  .strict();

// Maps DB statuses fast_context + generating_brief → single "generating_brief"
// value visible to clients (hides internal pipeline granularity).
const generatingBriefStatusSchema = z
  .object({
    card: businessCardPublicSchema,
    error_code: z.null(),
    flash_brief: z.null(),
    mutual_value: z.null(),
    scan_id: z.string().uuid(),
    status: z.literal("generating_brief"),
  })
  .strict();

const briefReadyStatusSchema = z
  .object({
    card: businessCardPublicSchema,
    error_code: z.null(),
    flash_brief: flashBriefPublicSchema,
    mutual_value: z.null(),
    scan_id: z.string().uuid(),
    status: z.literal("brief_ready"),
  })
  .strict();

const briefFailedStatusSchema = z
  .object({
    card: z.null(),
    error_code: z.string().min(1).max(100).nullable(),
    flash_brief: z.null(),
    mutual_value: z.null(),
    scan_id: z.string().uuid(),
    status: z.enum(["failed_retryable", "failed_terminal"]),
  })
  .strict();

// Maps DB status deep_enrichment → single "deep_enrichment" visible to clients.
const deepEnrichmentStatusSchema = z
  .object({
    card: businessCardPublicSchema,
    error_code: z.null(),
    flash_brief: flashBriefPublicSchema,
    mutual_value: z.null(),
    scan_id: z.string().uuid(),
    status: z.literal("deep_enrichment"),
  })
  .strict();

const deepReadyStatusSchema = z
  .object({
    card: businessCardPublicSchema,
    error_code: z.null(),
    flash_brief: flashBriefPublicSchema,
    mutual_value: mutualValuePublicSchema,
    scan_id: z.string().uuid(),
    status: z.literal("deep_ready"),
  })
  .strict();

export const scanStatusResponseSchema = z.discriminatedUnion("status", [
  extractingStatusSchema,
  cardReadyStatusSchema,
  generatingBriefStatusSchema,
  briefReadyStatusSchema,
  deepEnrichmentStatusSchema,
  deepReadyStatusSchema,
  briefFailedStatusSchema,
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export type FlashBriefStructuredOutput = z.infer<
  typeof flashBriefStructuredOutputSchema
>;
export type FlashBrief = z.infer<typeof flashBriefSchema>;
export type FlashBriefPublic = z.infer<typeof flashBriefPublicSchema>;
export type FlashBriefPersonalContextItem = z.infer<
  typeof flashBriefPersonalContextItemSchema
>;
export type FlashBriefInput = z.infer<typeof flashBriefInputSchema>;
export type ScanStatusResponse = z.infer<typeof scanStatusResponseSchema>;

// ─── Normalization ───────────────────────────────────────────────────────────

export class FlashBriefValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlashBriefValidationError";
  }
}

export function normalizeFlashBrief(input: unknown): FlashBrief {
  const structured = flashBriefStructuredOutputSchema.parse(input);

  const sayThis = structured.say_this
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sayThis.length === 0) {
    throw new FlashBriefValidationError(
      "Flash Brief must include at least one conversation starter.",
    );
  }

  const keywords = structured.connection_keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);

  return flashBriefSchema.parse({
    connection_keywords: keywords,
    identity_status: structured.identity_status,
    potential: structured.potential.trim(),
    potential_score: structured.potential_score,
    say_this: sayThis,
    who: structured.who.trim(),
    why_you: structured.why_you.trim(),
    why_you_claim_type: structured.why_you_claim_type,
  });
}
