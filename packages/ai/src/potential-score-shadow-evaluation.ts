import type { FlashBriefInput, FlashBriefPublic } from "@miraio/domain";

import {
  DecisionEvaluatorError,
  expectedDecisionScore,
  normalizeDecisionEvaluationResult,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
  type DecisionScoreQuestion,
  type DecisionState,
} from "./decision-evaluator";
import {
  maxShadowPersonalContextItemLength,
  maxShadowPersonalContextItems,
} from "./flash-brief-shadow-evaluation";
import {
  potentialScoreDefinition,
  potentialScoreLevelDescriptions,
  potentialScoreLevels,
} from "./potential-score-rubric";

/**
 * Scores POTENTIAL a second time, against the same rubric the generator used.
 *
 * This is the ADR-0005 thesis reduced to one number that can be checked. The
 * Flash Brief model writes the POTENTIAL sentences *and* rates them 1–5 in the
 * same response, which is the arrangement the ADR calls out: a model asked to
 * generate and to judge in one pass reports a confidence nobody can calibrate.
 * Here a typed evaluator rates the same sentences against the same five levels,
 * and the two numbers are returned side by side.
 *
 * It answers "do these two agree, and where do they diverge" — not "which is
 * right". No threshold, no verdict, nothing persisted, no route, absent from
 * `index.ts`. What counts as acceptable agreement is decided after human
 * scoring, in the same order everything else here follows.
 *
 * The one design decision worth stating: **the generator's own score is not in
 * the state.** An evaluator shown the answer it is being asked to reproduce
 * agrees with it, and the agreement measures nothing. The rating comes from the
 * sentences and the user's context alone.
 */

export type PotentialScoreShadowEvaluationRequest = Readonly<{
  brief: FlashBriefPublic;
  input: FlashBriefInput;
}>;

export type PotentialScoreShadowEvaluation = Readonly<{
  confidence: number;
  /**
   * The probability-weighted score across the whole scale. This is the number
   * to compare runs on: it moves when the distribution shifts, where the modal
   * level only moves when the peak crosses a level boundary.
   */
  expectedScore: number;
  /**
   * What the Flash Brief rated itself, carried through untouched.
   *
   * Null for a brief stored before `potential_score` existed
   * (`flashBriefPublicSchema` defaults it to null for exactly those rows).
   * The evaluator still rates the sentences — there is simply nothing to
   * compare its rating against, and reporting a null beats substituting a
   * number that no model ever produced.
   */
  generatorScore: number | null;
  /** The level carrying the most mass. */
  modalScore: number;
  probabilities: Readonly<Record<string, number>>;
}>;

export const potentialScoreQuestionId = "potential_score";

export const potentialScoreShadowQuestion: DecisionScoreQuestion = {
  id: potentialScoreQuestionId,
  levelDescriptions: potentialScoreLevelDescriptions,
  levels: [...potentialScoreLevels],
  prompt: `Rate the POTENTIAL statement in the state.\n\n${potentialScoreDefinition}`,
  type: "score",
};

// ─── Data minimization ───────────────────────────────────────────────────────
//
// An allow-list, as in the sibling shadow evaluations. Excluded: the person's
// name, email, phone, website, the card image, the raw OCR text, the
// unabridged Personal Context — and `potential_score`, for the reason in the
// module comment above.

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();

  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

export function buildPotentialScoreShadowEvaluationState(
  request: PotentialScoreShadowEvaluationRequest,
): DecisionState {
  const { brief, input } = request;

  return {
    card: {
      company: input.card.company,
      department: input.card.department,
      title: input.card.title,
    },
    connection_keywords: [...brief.connection_keywords],
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
    potential: brief.potential,
    why_you: brief.why_you,
  };
}

export function buildPotentialScoreShadowEvaluationRequest(
  request: PotentialScoreShadowEvaluationRequest,
): DecisionEvaluationRequest {
  return {
    questions: [potentialScoreShadowQuestion],
    state: buildPotentialScoreShadowEvaluationState(request),
  };
}

export function toPotentialScoreShadowEvaluation(
  generatorScore: number | null,
  result: DecisionEvaluationResult,
): PotentialScoreShadowEvaluation {
  const [answer] = result.answers;

  if (result.answers.length !== 1 || answer?.type !== "score") {
    throw new DecisionEvaluatorError("invalid_output");
  }

  return {
    confidence: answer.confidence,
    expectedScore: expectedDecisionScore(potentialScoreShadowQuestion, answer),
    generatorScore,
    modalScore: answer.score,
    probabilities: answer.probabilities,
  };
}

/**
 * Asks an evaluator to rate POTENTIAL. The result is returned to the caller and
 * nowhere else: the brief keeps the score it was generated with, whatever comes
 * back here.
 */
export async function evaluatePotentialScoreInShadow(
  evaluator: DecisionEvaluator,
  request: PotentialScoreShadowEvaluationRequest,
): Promise<PotentialScoreShadowEvaluation> {
  const evaluationRequest = buildPotentialScoreShadowEvaluationRequest(request);
  const result = await evaluator.evaluate(evaluationRequest);

  return toPotentialScoreShadowEvaluation(
    request.brief.potential_score,
    normalizeDecisionEvaluationResult(evaluationRequest, result),
  );
}
