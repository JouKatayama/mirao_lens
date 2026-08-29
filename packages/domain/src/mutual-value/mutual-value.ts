import { z } from "zod";

import { companyContextSchema } from "../company-context/company-context";
import { personalContextTypeSchema } from "../context/personal-context";
import { meetingGoalSchema } from "../scan/card-scan";

// ─── AI structured output ────────────────────────────────────────────────────
// evidence_ids is always required in AI output so the model is explicitly aware
// of the field (even if it always outputs []for MVP; deep enrichment populates
// real UUIDs in a future sprint).

const mutualValueItemSchema = z
  .object({
    text: z.string().min(1).max(1000),
    claim_type: z.enum(["fact", "hypothesis"]),
    evidence_ids: z.array(z.string().uuid()),
  })
  .strict();

const mutualValueAskSchema = z
  .object({
    question: z.string().min(1).max(400),
    validates_hypothesis: z.string().max(400).nullable(),
  })
  .strict();

const mutualValueNextActionSchema = z
  .object({
    action: z.string().min(1).max(400),
    timing: z.string().max(200).nullable(),
    reason: z.string().min(1).max(600),
  })
  .strict();

export const mutualValueStructuredOutputSchema = z
  .object({
    give: z.array(mutualValueItemSchema).min(1).max(5),
    get: z.array(mutualValueItemSchema).min(1).max(5),
    bridge: z.string().min(1).max(1000),
    ask: z.array(mutualValueAskSchema).min(1).max(3),
    next_action: mutualValueNextActionSchema,
  })
  .strict();

// ─── Canonical (stored in DB as mutual_value_json) ───────────────────────────
// evidence_ids defaults to [] for backward compat with rows stored before
// ML-011. All other fields are identical to the AI structured output schema.

const mutualValueItemStoredSchema = z
  .object({
    text: z.string().min(1).max(1000),
    claim_type: z.enum(["fact", "hypothesis"]),
    evidence_ids: z.array(z.string().uuid()).default([]),
  })
  .strict();

export const mutualValueSchema = z
  .object({
    give: z.array(mutualValueItemStoredSchema).min(1).max(5),
    get: z.array(mutualValueItemStoredSchema).min(1).max(5),
    bridge: z.string().min(1).max(1000),
    ask: z.array(mutualValueAskSchema).min(1).max(3),
    next_action: mutualValueNextActionSchema,
  })
  .strict();

export const mutualValuePublicSchema = mutualValueSchema;

// ─── Input for AI provider ────────────────────────────────────────────────────
//
// Defines a local flash brief context schema to avoid circular imports with
// flash-brief.ts (which imports mutualValuePublicSchema for the status union).

const mutualValuePersonalContextItemSchema = z
  .object({
    type: personalContextTypeSchema,
    text: z.string().min(1).max(4000),
    tags: z.array(z.string()),
  })
  .strict();

const mutualValueFlashBriefContextSchema = z
  .object({
    who: z.string().min(1),
    why_you: z.string().min(1),
    say_this: z.array(z.string().min(1)).min(1),
    potential: z.string().min(1),
  })
  .strict();

export const mutualValueInputSchema = z
  .object({
    card: z
      .object({
        name: z.string().nullable(),
        company: z.string().nullable(),
        department: z.string().nullable(),
        email: z.string().nullable().optional(),
        language: z.string(),
        phone: z.string().nullable().optional(),
        title: z.string().nullable(),
        website: z.string().nullable().optional(),
      })
      .strict(),
    // Company context from ML-008: enriches GIVE/GET/BRIDGE with industry and
    // role-level information not available from the card alone.
    company_context: companyContextSchema.nullable().optional(),
    flash_brief: mutualValueFlashBriefContextSchema,
    locale: z.string().min(2).max(35).default("ja"),
    meeting_goal: meetingGoalSchema,
    personal_context: z
      .object({
        current_company: z.string().nullable(),
        current_role: z.string().nullable(),
        items: z.array(mutualValuePersonalContextItemSchema),
      })
      .strict(),
  })
  .strict();

// ─── Types ───────────────────────────────────────────────────────────────────

export type MutualValueStructuredOutput = z.infer<
  typeof mutualValueStructuredOutputSchema
>;
export type MutualValue = z.infer<typeof mutualValueSchema>;
export type MutualValuePublic = z.infer<typeof mutualValuePublicSchema>;
export type MutualValueInput = z.infer<typeof mutualValueInputSchema>;

// ─── Normalization ───────────────────────────────────────────────────────────

export class MutualValueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutualValueValidationError";
  }
}

export function normalizeMutualValue(input: unknown): MutualValue {
  const structured = mutualValueStructuredOutputSchema.parse(input);

  const give = structured.give.filter((item) => item.text.trim().length > 0);
  const get = structured.get.filter((item) => item.text.trim().length > 0);
  const ask = structured.ask.filter((item) => item.question.trim().length > 0);

  if (give.length === 0) {
    throw new MutualValueValidationError(
      "Mutual Value must include at least one GIVE item.",
    );
  }

  if (get.length === 0) {
    throw new MutualValueValidationError(
      "Mutual Value must include at least one GET item.",
    );
  }

  if (ask.length === 0) {
    throw new MutualValueValidationError(
      "Mutual Value must include at least one ASK item.",
    );
  }

  return mutualValueSchema.parse({
    ask: ask.map((item) => ({
      question: item.question.trim(),
      validates_hypothesis: item.validates_hypothesis?.trim() || null,
    })),
    bridge: structured.bridge.trim(),
    get: get.map((item) => ({
      claim_type: item.claim_type,
      evidence_ids: item.evidence_ids,
      text: item.text.trim(),
    })),
    give: give.map((item) => ({
      claim_type: item.claim_type,
      evidence_ids: item.evidence_ids,
      text: item.text.trim(),
    })),
    next_action: {
      action: structured.next_action.action.trim(),
      reason: structured.next_action.reason.trim(),
      timing: structured.next_action.timing?.trim() || null,
    },
  });
}
