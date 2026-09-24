import {
  DecisionEvaluatorError,
  normalizeDecisionEvaluationRequest,
  normalizeDecisionEvaluationResult,
  toDecisionScoreProbabilityKey,
  type DecisionAnswer,
  type DecisionChoiceAnswer,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
  type DecisionScoreAnswer,
} from "./decision-evaluator";

/**
 * A `DecisionEvaluator` that answers from a table.
 *
 * It exists so the decision layer and everything built on it can be tested
 * before any provider is connected, and it is built to be useless in
 * production: it reaches no network, it has no configuration beyond the table,
 * and it is excluded from `tsconfig.build.json` and from `index.ts`, so it is
 * neither published in `dist` nor reachable from `@miraio/ai`. Import it by
 * relative path from a test.
 *
 * It fails rather than improvises. A question with no entry in the table is a
 * `configuration` error, because a fake that quietly skipped it would let a
 * test assert over a rubric it never actually scored.
 */

export type FakeDecisionAnswers = Readonly<Record<string, DecisionAnswer>>;

/** Mass the helpers put on the selected outcome; the rest is spread evenly. */
export const fakeSelectedProbability = 0.6;

function distributionOver(
  outcomes: readonly string[],
  selected: string,
): Record<string, number> {
  if (!outcomes.includes(selected)) {
    throw new DecisionEvaluatorError("configuration");
  }

  const others = outcomes.filter((outcome) => outcome !== selected);

  if (others.length === 0) {
    return { [selected]: 1 };
  }

  const share = (1 - fakeSelectedProbability) / others.length;
  const distribution: Record<string, number> = {
    [selected]: fakeSelectedProbability,
  };

  for (const other of others) {
    distribution[other] = share;
  }

  return distribution;
}

export function fakeChoiceAnswer(answer: {
  choice: string;
  confidence: number;
  id: string;
  options: readonly string[];
}): DecisionChoiceAnswer {
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    id: answer.id,
    probabilities: distributionOver(answer.options, answer.choice),
    type: "choice",
  };
}

export function fakeScoreAnswer(answer: {
  confidence: number;
  id: string;
  levels: readonly number[];
  score: number;
}): DecisionScoreAnswer {
  return {
    confidence: answer.confidence,
    id: answer.id,
    probabilities: distributionOver(
      answer.levels.map(toDecisionScoreProbabilityKey),
      toDecisionScoreProbabilityKey(answer.score),
    ),
    score: answer.score,
    type: "score",
  };
}

export class FakeDecisionEvaluator implements DecisionEvaluator {
  constructor(private readonly answers: FakeDecisionAnswers) {}

  async evaluate(
    request: DecisionEvaluationRequest,
  ): Promise<DecisionEvaluationResult> {
    const normalized = normalizeDecisionEvaluationRequest(request);

    const answers = normalized.questions.map((question) => {
      const answer = this.answers[question.id];

      if (!answer) {
        throw new DecisionEvaluatorError("configuration");
      }

      return answer;
    });

    // The fake is held to the same contract as a real provider, so a table
    // entry that contradicts its question fails here rather than in the test
    // that trusted it.
    return normalizeDecisionEvaluationResult(normalized, { answers });
  }
}
