import type { FlashBriefInput, FlashBriefPublic } from "@miraio/domain";

import {
  briefEvaluationDimensionDescriptions,
  briefEvaluationDimensions,
  briefEvaluationScaleDescription,
  briefEvaluationScoreLevelDescriptions,
  briefEvaluationScoreLevels,
  type BriefEvaluationDimension,
} from "./brief-evaluation-rubric";
import {
  DecisionEvaluatorError,
  normalizeDecisionEvaluationResult,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
  type DecisionScoreQuestion,
  type DecisionState,
} from "./decision-evaluator";

/**
 * Scores a Flash Brief that has already been generated and returned.
 *
 * This is a shadow evaluation, not a quality gate. It reads a brief and says
 * what a typed evaluator thinks of it on the eight rubric dimensions; it
 * changes nothing. There is deliberately no threshold here, no retry, no
 * rewrite of the brief, and no route that calls it: what counts as a passing
 * score is unknown until the Golden Dataset and human scoring say so, and a
 * number invented before that measurement would be a product decision
 * disguised as a constant. See ADR-0005.
 *
 * Every function is pure — the evaluator is a parameter, not a dependency —
 * so the 5-second Flash Brief path cannot acquire latency from this module by
 * accident. Like `brief-judge.ts`, it is absent from `index.ts`.
 *
 * Note what it is worth: it measures agreement with a rubric, and the rubric's
 * authority still comes from `compareJudgeToHuman` in `@miraio/test-fixtures`.
 */

export type FlashBriefShadowEvaluationRequest = Readonly<{
  brief: FlashBriefPublic;
  input: FlashBriefInput;
}>;

export type FlashBriefShadowDimensionScore = Readonly<{
  confidence: number;
  dimension: BriefEvaluationDimension;
  /** Mass over each level of the 1–5 scale, keyed by level. */
  probabilities: Readonly<Record<string, number>>;
  score: number;
}>;

export type FlashBriefShadowEvaluation = Readonly<{
  dimensions: readonly FlashBriefShadowDimensionScore[];
  /** Unweighted mean of the eight dimension scores. */
  overall: number;
}>;

// ─── Data minimization ───────────────────────────────────────────────────────
//
// The rubric needs to know who this person is to the user and what the brief
// claimed. It never needs a way to contact anybody. So the state is built by
// naming the fields that go in rather than by naming the ones that stay out:
// a field added to the card contract later cannot leak here by default.
//
// Excluded on purpose: email, phone, website, the raw card image, the raw OCR
// text, and the unabridged Personal Context.

export const maxShadowPersonalContextItems = 12;
export const maxShadowPersonalContextItemLength = 200;

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();

  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

export function buildFlashBriefShadowEvaluationState(
  request: FlashBriefShadowEvaluationRequest,
): DecisionState {
  const { brief, input } = request;

  return {
    card: {
      company: input.card.company,
      department: input.card.department,
      name: input.card.name,
      title: input.card.title,
    },
    flash_brief: {
      connection_keywords: [...brief.connection_keywords],
      identity_status: brief.identity_status,
      potential: brief.potential,
      potential_score: brief.potential_score,
      say_this: [...brief.say_this],
      who: brief.who,
      why_you: brief.why_you,
      why_you_claim_type: brief.why_you_claim_type,
    },
    locale: input.locale,
    meeting_goal: input.meeting_goal,
    personal_context: {
      current_company: input.personal_context.current_company,
      current_role: input.personal_context.current_role,
      items: input.personal_context.items
        .slice(0, maxShadowPersonalContextItems)
        .map((item) =>
          truncate(
            `[${item.type}] ${item.text}`,
            maxShadowPersonalContextItemLength,
          ),
        ),
    },
  };
}

// ─── Questions ───────────────────────────────────────────────────────────────

/**
 * One score question per dimension, asked in rubric order. The question id is
 * the dimension name, so a missing dimension and an unanswered question are
 * the same failure.
 */
export const flashBriefShadowEvaluationQuestions: readonly DecisionScoreQuestion[] =
  briefEvaluationDimensions.map((dimension) => ({
    id: dimension,
    // The prompt says what this dimension judges; the level descriptions
    // say what each point on the scale means. An evaluator asked to put
    // mass on every level needs both, and until the second existed this
    // module was asking for a distribution over five numbers it had never
    // defined.
    levelDescriptions: briefEvaluationScoreLevelDescriptions,
    levels: [...briefEvaluationScoreLevels],
    prompt: `${briefEvaluationDimensionDescriptions[dimension]}\n\n${briefEvaluationScaleDescription}`,
    type: "score",
  }));

export function buildFlashBriefShadowEvaluationRequest(
  request: FlashBriefShadowEvaluationRequest,
): DecisionEvaluationRequest {
  return {
    questions: [...flashBriefShadowEvaluationQuestions],
    state: buildFlashBriefShadowEvaluationState(request),
  };
}

// ─── Result ──────────────────────────────────────────────────────────────────

/**
 * A rubric scored over the wrong set of dimensions is not a partial
 * measurement: the mean below would still return a plausible number, and
 * nothing downstream could tell it apart from a real one.
 */
export function toFlashBriefShadowEvaluation(
  result: DecisionEvaluationResult,
): FlashBriefShadowEvaluation {
  const byDimension = new Map<string, FlashBriefShadowDimensionScore>();

  for (const answer of result.answers) {
    if (answer.type !== "score" || byDimension.has(answer.id)) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    byDimension.set(answer.id, {
      confidence: answer.confidence,
      dimension: answer.id as BriefEvaluationDimension,
      probabilities: answer.probabilities,
      score: answer.score,
    });
  }

  const dimensions = briefEvaluationDimensions.map((dimension) => {
    const scored = byDimension.get(dimension);

    if (!scored) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    byDimension.delete(dimension);

    return scored;
  });

  if (byDimension.size > 0) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  const overall =
    dimensions.reduce((sum, entry) => sum + entry.score, 0) / dimensions.length;

  return { dimensions, overall };
}

/**
 * Asks an evaluator for a shadow score. The result is returned to the caller
 * and nowhere else: it is not persisted, not attached to the scan, and not
 * exposed by any API.
 */
export async function evaluateFlashBriefInShadow(
  evaluator: DecisionEvaluator,
  request: FlashBriefShadowEvaluationRequest,
): Promise<FlashBriefShadowEvaluation> {
  const evaluationRequest = buildFlashBriefShadowEvaluationRequest(request);
  const result = await evaluator.evaluate(evaluationRequest);

  // The evaluator is an interface, so its answers are re-checked against the
  // questions we actually asked rather than taken on trust.
  return toFlashBriefShadowEvaluation(
    normalizeDecisionEvaluationResult(evaluationRequest, result),
  );
}
