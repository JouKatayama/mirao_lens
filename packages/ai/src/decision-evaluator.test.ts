import { describe, expect, it } from "vitest";

import {
  DecisionEvaluatorError,
  normalizeDecisionEvaluationRequest,
  normalizeDecisionEvaluationResult,
  toDecisionScoreProbabilityKey,
  type DecisionBooleanQuestion,
  type DecisionChoiceQuestion,
  type DecisionEvaluationRequest,
  type DecisionQuestion,
  type DecisionScoreQuestion,
  type DecisionState,
} from "./decision-evaluator";
import {
  fakeChoiceAnswer,
  fakeScoreAnswer,
  FakeDecisionEvaluator,
} from "./decision-evaluator.fixture";

const choiceQuestion: DecisionChoiceQuestion = {
  id: "next_action",
  options: ["follow_up_email", "introduction", "no_action"],
  prompt: "Which next action does the evidence support?",
  type: "choice",
};

const scoreQuestion: DecisionScoreQuestion = {
  id: "grounding",
  levels: [1, 2, 3, 4, 5],
  prompt: "How well grounded is the claim?",
  type: "score",
};

const booleanQuestion: DecisionBooleanQuestion = {
  id: "sensitive_inference",
  prompt: "Does the text infer a sensitive attribute?",
  type: "boolean",
};

const state: DecisionState = {
  claim: "製造業DXの経験が噛み合う可能性がある",
  meeting_goal: "sales",
  sources: ["card", "personal_context"],
  supporting: { card_fields: 3, context_items: 1 },
};

function requestWith(
  ...questions: readonly DecisionQuestion[]
): DecisionEvaluationRequest {
  return { questions: [...questions], state };
}

function thrownCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof DecisionEvaluatorError ? error.code : undefined;
  }

  return undefined;
}

const choiceAnswer = {
  choice: "follow_up_email",
  confidence: 0.72,
  id: "next_action",
  probabilities: {
    follow_up_email: 0.6,
    introduction: 0.3,
    no_action: 0.1,
  },
  type: "choice",
} as const;

const scoreAnswer = {
  confidence: 0.55,
  id: "grounding",
  probabilities: { "1": 0.05, "2": 0.05, "3": 0.2, "4": 0.5, "5": 0.2 },
  score: 4,
  type: "score",
} as const;

const booleanAnswer = {
  confidence: 0.9,
  holds: false,
  id: "sensitive_inference",
  probability: 0.02,
  type: "boolean",
} as const;

describe("decision evaluation request", () => {
  it("accepts choice, score and boolean questions over JSON-safe state", () => {
    const request = normalizeDecisionEvaluationRequest(
      requestWith(choiceQuestion, scoreQuestion, booleanQuestion),
    );

    expect(request.questions).toHaveLength(3);
    expect(request.state).toEqual(state);
  });

  it("rejects duplicate question ids", () => {
    expect(() =>
      normalizeDecisionEvaluationRequest(
        requestWith(scoreQuestion, { ...scoreQuestion, prompt: "Again?" }),
      ),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a choice with no options", () => {
    expect(() =>
      normalizeDecisionEvaluationRequest(
        requestWith({ ...choiceQuestion, options: [] }),
      ),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a choice that declares the same option twice", () => {
    expect(() =>
      normalizeDecisionEvaluationRequest(
        requestWith({
          ...choiceQuestion,
          options: ["introduction", "introduction"],
        }),
      ),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a score scale with fewer than two levels", () => {
    expect(() =>
      normalizeDecisionEvaluationRequest(
        requestWith({ ...scoreQuestion, levels: [3] }),
      ),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a score scale that is not strictly ascending", () => {
    expect(() =>
      normalizeDecisionEvaluationRequest(
        requestWith({ ...scoreQuestion, levels: [1, 3, 2] }),
      ),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects state values that JSON cannot carry", () => {
    const unsafe = [
      { when: new Date(0) },
      { missing: undefined },
      { ratio: Number.NaN },
      { budget: Number.POSITIVE_INFINITY },
      { nested: { deeper: [() => null] } },
    ];

    for (const value of unsafe) {
      expect(() =>
        normalizeDecisionEvaluationRequest({
          questions: [scoreQuestion],
          state: value as unknown as DecisionState,
        }),
      ).toThrow(DecisionEvaluatorError);
    }
  });

  it("reports a rejected request as invalid_request", () => {
    expect(
      thrownCode(() =>
        normalizeDecisionEvaluationRequest(
          requestWith(scoreQuestion, scoreQuestion),
        ),
      ),
    ).toBe("invalid_request");
  });
});

describe("decision evaluation result", () => {
  const request = requestWith(choiceQuestion, scoreQuestion, booleanQuestion);

  it("accepts one well-formed answer per question", () => {
    const result = normalizeDecisionEvaluationResult(request, {
      answers: [booleanAnswer, scoreAnswer, choiceAnswer],
    });

    // Question order, not provider order, so a caller can zip the two lists.
    expect(result.answers.map((answer) => answer.id)).toEqual([
      "next_action",
      "grounding",
      "sensitive_inference",
    ]);
    expect(result.answers[0]).toMatchObject({
      choice: "follow_up_email",
      type: "choice",
    });
    expect(result.answers[1]).toMatchObject({ score: 4, type: "score" });
    expect(result.answers[2]).toMatchObject({
      holds: false,
      probability: 0.02,
      type: "boolean",
    });
  });

  it("rejects a confidence outside the unit interval", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(scoreQuestion), {
        answers: [{ ...scoreAnswer, confidence: 1.4 }],
      }),
    ).toThrow(DecisionEvaluatorError);

    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(scoreQuestion), {
        answers: [{ ...scoreAnswer, confidence: -0.1 }],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a probability outside the unit interval", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(booleanQuestion), {
        answers: [{ ...booleanAnswer, probability: 1.2 }],
      }),
    ).toThrow(DecisionEvaluatorError);

    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(choiceQuestion), {
        answers: [
          {
            ...choiceAnswer,
            probabilities: {
              follow_up_email: -0.2,
              introduction: 0.9,
              no_action: 0.3,
            },
          },
        ],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a choice value the question never declared", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(choiceQuestion), {
        answers: [{ ...choiceAnswer, choice: "send_gift" }],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a probability over an outcome the question never declared", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(choiceQuestion), {
        answers: [
          {
            ...choiceAnswer,
            probabilities: { ...choiceAnswer.probabilities, send_gift: 0 },
          },
        ],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects probabilities that leave a declared outcome unscored", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(choiceQuestion), {
        answers: [
          {
            ...choiceAnswer,
            probabilities: { follow_up_email: 0.7, introduction: 0.3 },
          },
        ],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a distribution that does not sum to one", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(choiceQuestion), {
        answers: [
          {
            ...choiceAnswer,
            probabilities: {
              follow_up_email: 0.2,
              introduction: 0.2,
              no_action: 0.2,
            },
          },
        ],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects a score outside the declared levels", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(scoreQuestion), {
        answers: [{ ...scoreAnswer, score: 7 }],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects an answer whose type does not match its question", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(scoreQuestion), {
        answers: [{ ...booleanAnswer, id: "grounding" }],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects an answer for a question that was never asked", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(scoreQuestion), {
        answers: [scoreAnswer, { ...scoreAnswer, id: "unasked" }],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects an unanswered question", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(
        requestWith(scoreQuestion, booleanQuestion),
        { answers: [scoreAnswer] },
      ),
    ).toThrow(DecisionEvaluatorError);
  });

  it("rejects the same question answered twice", () => {
    expect(() =>
      normalizeDecisionEvaluationResult(requestWith(scoreQuestion), {
        answers: [scoreAnswer, { ...scoreAnswer, score: 2 }],
      }),
    ).toThrow(DecisionEvaluatorError);
  });

  it("reports a malformed response as invalid_output", () => {
    expect(
      thrownCode(() =>
        normalizeDecisionEvaluationResult(requestWith(scoreQuestion), null),
      ),
    ).toBe("invalid_output");
  });

  it("keys score probabilities by the level they belong to", () => {
    expect(toDecisionScoreProbabilityKey(4)).toBe("4");
  });
});

describe("fake decision evaluator", () => {
  const request = requestWith(choiceQuestion, scoreQuestion);
  const evaluator = new FakeDecisionEvaluator({
    grounding: fakeScoreAnswer({
      confidence: 0.6,
      id: "grounding",
      levels: scoreQuestion.levels,
      score: 4,
    }),
    next_action: fakeChoiceAnswer({
      choice: "follow_up_email",
      confidence: 0.8,
      id: "next_action",
      options: choiceQuestion.options,
    }),
  });

  it("answers every question from its fixed table", async () => {
    const result = await evaluator.evaluate(request);

    expect(result.answers.map((answer) => answer.id)).toEqual([
      "next_action",
      "grounding",
    ]);
  });

  it("returns an identical result for an identical request", async () => {
    const first = await evaluator.evaluate(request);
    const second = await evaluator.evaluate(request);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("fails loudly on a question it was not configured to answer", async () => {
    await expect(
      evaluator.evaluate(requestWith(booleanQuestion)),
    ).rejects.toMatchObject({ code: "configuration" });
  });
});

describe("outcome descriptions", () => {
  const describedScore: DecisionScoreQuestion = {
    ...scoreQuestion,
    levelDescriptions: {
      "1": "No claim in it is traceable to the card or the context.",
      "2": "Most of it is inferred.",
      "3": "Traceable, with one inference left unlabelled.",
      "4": "Traceable, with every inference labelled.",
      "5": "Every claim is read directly from a supplied source.",
    },
  };

  const describedChoice: DecisionChoiceQuestion = {
    ...choiceQuestion,
    optionDescriptions: {
      follow_up_email: "Write to them about the overlap that came up.",
      introduction: "Connect them to someone in the user's network.",
      no_action: "Nothing here is worth acting on yet.",
    },
  };

  it("accepts a scale and a choice that describe every outcome", () => {
    expect(() =>
      normalizeDecisionEvaluationRequest(
        requestWith(describedScore, describedChoice),
      ),
    ).not.toThrow();
  });

  it("keeps descriptions optional", () => {
    // A scale whose meaning is fully carried by the prompt is still a legal
    // question; nothing existing has to be rewritten to add a rubric.
    expect(() =>
      normalizeDecisionEvaluationRequest(requestWith(scoreQuestion)),
    ).not.toThrow();
  });

  it("rejects a rubric with a hole in it", () => {
    const { "3": _unused, ...missing } = describedScore.levelDescriptions ?? {};

    expect(
      thrownCode(() =>
        normalizeDecisionEvaluationRequest(
          requestWith({ ...describedScore, levelDescriptions: missing }),
        ),
      ),
    ).toBe("invalid_request");
  });

  it("rejects a description keyed to an outcome the question does not have", () => {
    expect(
      thrownCode(() =>
        normalizeDecisionEvaluationRequest(
          requestWith({
            ...describedScore,
            levelDescriptions: {
              ...describedScore.levelDescriptions,
              "6": "A level this scale does not declare.",
            },
          }),
        ),
      ),
    ).toBe("invalid_request");

    expect(
      thrownCode(() =>
        normalizeDecisionEvaluationRequest(
          requestWith({
            ...describedChoice,
            optionDescriptions: {
              ...describedChoice.optionDescriptions,
              unasked: "An option this question does not offer.",
            },
          }),
        ),
      ),
    ).toBe("invalid_request");
  });

  it("rejects a description that says nothing", () => {
    expect(
      thrownCode(() =>
        normalizeDecisionEvaluationRequest(
          requestWith({
            ...describedChoice,
            optionDescriptions: {
              ...describedChoice.optionDescriptions,
              no_action: "   ",
            },
          }),
        ),
      ),
    ).toBe("invalid_request");
  });

  it("changes nothing about how an answer is validated", () => {
    const result = normalizeDecisionEvaluationResult(
      requestWith(describedScore),
      { answers: [scoreAnswer] },
    );

    expect(result.answers[0]).toMatchObject({ score: 4, type: "score" });
  });
});
