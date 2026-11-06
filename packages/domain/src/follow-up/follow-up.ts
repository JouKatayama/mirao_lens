import { z } from "zod";

import { personalContextTypeSchema } from "../context/personal-context";
import { connectionTypeSchema } from "../relationship-graph/relationship-graph";
import { meetingGoalSchema } from "../scan/card-scan";

/**
 * Pilot extension 5 (spec §2.4, ADR-0010): whether to follow up after an
 * encounter, prepared up to the point of approval.
 *
 * Judging and drafting are separate stages (ADR-0005). The judgement is a
 * typed choice among declared options; a draft is written only after a
 * `follow_up` decision, and only from inputs that may appear in a message. The
 * system never sends: approval hands the draft to the user's own device.
 */

export const followUpDecisions = ["follow_up", "hold", "no_follow_up"] as const;
export const followUpDecisionSchema = z.enum(followUpDecisions);
export type FollowUpDecision = z.infer<typeof followUpDecisionSchema>;

/** What a reason rests on, so the user can see where it came from. */
export const followUpReasonSources = [
  "card",
  "meeting_goal",
  "note",
  "mutual_value",
  "next_action",
  "encounter_history",
  "connection",
] as const;

export const followUpReasonSchema = z
  .object({
    claim_type: z.enum(["fact", "hypothesis"]),
    source: z.enum(followUpReasonSources),
    text: z.string().min(1).max(400),
  })
  .strict();

export type FollowUpReason = z.infer<typeof followUpReasonSchema>;

// ─── Judgement stage ─────────────────────────────────────────────────────────

export const followUpJudgementOutputSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    decision: followUpDecisionSchema,
    reasons: z.array(followUpReasonSchema).min(1).max(3),
    timing: z.string().max(200).nullable(),
    uncertainty: z.string().max(600).nullable(),
  })
  .strict();

export type FollowUpJudgement = z.infer<typeof followUpJudgementOutputSchema>;

/**
 * Below this, a judgement is not confident enough to tell the user to act or to
 * let go. Low data is normal (Locked Decision 5); it becomes `hold` with the
 * reason stated, never a confident guess.
 */
export const followUpMinimumConfidence = 0.5;

export function normalizeFollowUpJudgement(input: unknown): FollowUpJudgement {
  const judgement = followUpJudgementOutputSchema.parse(input);

  if (
    judgement.decision === "hold" ||
    judgement.confidence >= followUpMinimumConfidence
  ) {
    return judgement;
  }

  return {
    ...judgement,
    decision: "hold",
    uncertainty:
      judgement.uncertainty ?? "判断の材料が少ないため、今は保留にしています。",
  };
}

// ─── Draft stage ─────────────────────────────────────────────────────────────

export const followUpDraftSchema = z
  .object({
    body: z.string().min(1).max(4000),
    subject: z.string().min(1).max(200),
  })
  .strict();

export type FollowUpDraft = z.infer<typeof followUpDraftSchema>;

// ─── Input ───────────────────────────────────────────────────────────────────

const followUpPersonalContextItemSchema = z
  .object({
    text: z.string().min(1).max(4000),
    type: personalContextTypeSchema,
  })
  .strict();

export const followUpInputSchema = z
  .object({
    card: z
      .object({
        company: z.string().nullable(),
        name: z.string().nullable(),
        title: z.string().nullable(),
      })
      .strict(),
    /** Approved connections only; an unaccepted AI suggestion is not context. */
    connections: z.array(
      z
        .object({
          connection_type: connectionTypeSchema,
          name: z.string(),
        })
        .strict(),
    ),
    locale: z.string().min(2).max(35).default("ja"),
    meeting_goal: meetingGoalSchema,
    /** AI-generated, so every claim drawn from it is a Hypothesis. */
    mutual_value: z
      .object({
        bridge: z.string(),
        next_action: z.string(),
      })
      .strict()
      .nullable(),
    next_actions: z.array(
      z
        .object({
          action_text: z.string(),
          status: z.enum(["suggested", "accepted", "dismissed", "completed"]),
        })
        .strict(),
    ),
    /** The user's own saved note: their record, not an inference. */
    note: z.string().nullable(),
    personal_context: z
      .object({
        current_company: z.string().nullable(),
        current_role: z.string().nullable(),
        items: z.array(followUpPersonalContextItemSchema),
      })
      .strict(),
    previous_encounter_count: z.number().int().min(0),
  })
  .strict();

export type FollowUpInput = z.infer<typeof followUpInputSchema>;

/**
 * What the drafting stage may see. A draft may state only card facts, the
 * user's reviewed note, and the user's approved Personal Context (spec §2.4).
 * Mutual Value and hypothesis reasons are AI output, so they are left out
 * rather than trusted not to leak into the message as facts.
 */
export const followUpDraftInputSchema = z
  .object({
    card: followUpInputSchema.shape.card,
    fact_reasons: z.array(z.string()),
    locale: z.string(),
    meeting_goal: meetingGoalSchema,
    note: z.string().nullable(),
    personal_context: followUpInputSchema.shape.personal_context,
    timing: z.string().nullable(),
  })
  .strict();

export type FollowUpDraftInput = z.infer<typeof followUpDraftInputSchema>;

export function toFollowUpDraftInput(
  input: FollowUpInput,
  judgement: FollowUpJudgement,
): FollowUpDraftInput {
  return {
    card: input.card,
    fact_reasons: judgement.reasons
      .filter((reason) => reason.claim_type === "fact")
      .map((reason) => reason.text),
    locale: input.locale,
    meeting_goal: input.meeting_goal,
    note: input.note,
    personal_context: input.personal_context,
    timing: judgement.timing,
  };
}

// ─── Stored / public recommendation ──────────────────────────────────────────

export const followUpStatuses = ["suggested", "approved", "dismissed"] as const;
export const followUpStatusSchema = z.enum(followUpStatuses);
export type FollowUpStatus = z.infer<typeof followUpStatusSchema>;

export const followUpRecommendationSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    decided_at: z.string().nullable(),
    decision: followUpDecisionSchema,
    /** Null for hold / no_follow_up, or when drafting failed. */
    draft: followUpDraftSchema.nullable(),
    edited: z.boolean(),
    generated_at: z.string(),
    id: z.string().uuid(),
    reasons: z.array(followUpReasonSchema),
    /** From the card, so the device can open its own compose screen. */
    recipient_email: z.string().nullable(),
    scan_id: z.string().uuid(),
    status: followUpStatusSchema,
    timing: z.string().nullable(),
    uncertainty: z.string().nullable(),
  })
  .strict();

export type FollowUpRecommendation = z.infer<
  typeof followUpRecommendationSchema
>;

export const followUpResponseSchema = z
  .object({
    recommendation: followUpRecommendationSchema.nullable(),
    scan_id: z.string().uuid(),
  })
  .strict();

export type FollowUpResponse = z.infer<typeof followUpResponseSchema>;

/**
 * The user's decision. Approving may carry the draft as the user edited it;
 * approving records the decision and nothing else — the device does the rest.
 */
export const followUpDecisionRequestSchema = z.discriminatedUnion("status", [
  z
    .object({
      draft: followUpDraftSchema.optional(),
      status: z.literal("approved"),
    })
    .strict(),
  z.object({ status: z.literal("dismissed") }).strict(),
]);

export type FollowUpDecisionRequest = z.infer<
  typeof followUpDecisionRequestSchema
>;
