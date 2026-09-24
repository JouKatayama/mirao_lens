import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  TypeSafeError,
} from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  DecisionEvaluatorError,
  expectedDecisionScore,
  type DecisionBooleanQuestion,
  type DecisionChoiceQuestion,
  type DecisionEvaluationRequest,
  type DecisionScoreQuestion,
  type DecisionState,
} from "../decision-evaluator";
import {
  createJevClient,
  JevDecisionEvaluator,
  jevDefaultModel,
  jevMaxScoreLevels,
  toJevQuestions,
  type JevSystemOneRequest,
} from "./jev-decision-evaluator";

/**
 * Every fixture here is invented and carries no personal data, per AGENTS.md.
 * Nothing in this file reaches the network: the adapter takes its transport as
 * an option, so the translation is driven directly.
 */

const choiceQuestion: DecisionChoiceQuestion = {
  id: "say_this_selection",
  options: ["candidate_1", "candidate_2", "abstain"],
  prompt: "Which opening question should be asked first?",
  type: "choice",
};

const scoreQuestion: DecisionScoreQuestion = {
  id: "grounding",
  levels: [1, 2, 3, 4, 5],
  prompt: "How well grounded is the brief?",
  type: "score",
};

const booleanQuestion: DecisionBooleanQuestion = {
  id: "answerable",
  prompt: "The recipient can answer this on the spot.",
  type: "boolean",
};

const state: DecisionState = {
  card: { company: "架空精密工業株式会社", title: "課長" },
  meeting_goal: "sales",
};

function requestWith(
  ...questions: DecisionEvaluationRequest["questions"]
): DecisionEvaluationRequest {
  return { questions: [...questions], state };
}

const jevChoiceAnswer = {
  choice: "candidate_1",
  confidence: 0.74,
  probabilities: { abstain: 0.1, candidate_1: 0.6, candidate_2: 0.3 },
  type: "choice",
};

/** Jev keys a five-level rubric "0".."4" and returns an interpolated score. */
const jevScoreAnswer = {
  confidence: 0.41,
  probabilities: { "0": 0.05, "1": 0.05, "2": 0.2, "3": 0.5, "4": 0.2 },
  score: 2.75,
  type: "score",
};

const jevNoulAnswer = { noul: 0.83, type: "noul" };

function respondWith(answers: Readonly<Record<string, unknown>>) {
  return async () => ({
    answers,
    model: "jev-1.13.0",
    usage: { input_tokens: 120, output_tokens: 8 },
  });
}

function failWith(error: unknown): JevSystemOneRequest {
  return async () => {
    throw error;
  };
}

function evaluatorFor(request: JevSystemOneRequest): JevDecisionEvaluator {
  return new JevDecisionEvaluator({ request });
}

async function codeOf(
  run: () => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    return error instanceof DecisionEvaluatorError ? error.code : undefined;
  }

  return undefined;
}

function apiError(status: number): APIError {
  return APIError.fromResponse(status, { error: "denied" }, new Headers());
}

describe("jev request translation", () => {
  it("sends choice options as undescribed labels", () => {
    expect(toJevQuestions(requestWith(choiceQuestion))).toEqual({
      say_this_selection: {
        criteria: { abstain: null, candidate_1: null, candidate_2: null },
        instructions: choiceQuestion.prompt,
        type: "choice",
      },
    });
  });

  it("sends a score scale as an ordered rubric of level labels", () => {
    expect(toJevQuestions(requestWith(scoreQuestion))).toEqual({
      grounding: {
        criteria: ["1", "2", "3", "4", "5"],
        instructions: scoreQuestion.prompt,
        type: "score",
      },
    });
  });

  it("sends a boolean question as a noul", () => {
    expect(toJevQuestions(requestWith(booleanQuestion))).toEqual({
      answerable: {
        instructions: booleanQuestion.prompt,
        type: "noul",
      },
    });
  });

  it("keys questions by id so an answer can be attributed", () => {
    const questions = toJevQuestions(
      requestWith(choiceQuestion, scoreQuestion, booleanQuestion),
    );

    expect(Object.keys(questions).sort()).toEqual([
      "answerable",
      "grounding",
      "say_this_selection",
    ]);
  });

  it("rejects a scale the contract allows but Jev does not", async () => {
    // Eleven levels is legal here and illegal there, so it must fail as our
    // request defect rather than as an HTTP 422 read as a provider problem.
    const levels = Array.from(
      { length: jevMaxScoreLevels + 1 },
      (_unused, index) => index + 1,
    );

    expect(
      await codeOf(() =>
        evaluatorFor(respondWith({})).evaluate(
          requestWith({ ...scoreQuestion, levels }),
        ),
      ),
    ).toBe("invalid_request");
  });

  it("never sends state a question did not ask about", async () => {
    let sent: unknown;

    await evaluatorFor(async (payload) => {
      sent = payload.state;

      return { answers: { answerable: jevNoulAnswer } };
    }).evaluate(requestWith(booleanQuestion));

    expect(sent).toEqual(state);
  });

  it("defaults to the floating model alias", async () => {
    let sent: string | undefined;

    await evaluatorFor(async (payload) => {
      sent = payload.model;

      return { answers: { answerable: jevNoulAnswer } };
    }).evaluate(requestWith(booleanQuestion));

    expect(sent).toBe(jevDefaultModel);
  });

  it("uses a pinned model when one is configured", async () => {
    let sent: string | undefined;

    await new JevDecisionEvaluator({
      model: " jev-1.13.0 ",
      request: async (payload) => {
        sent = payload.model;

        return { answers: { answerable: jevNoulAnswer } };
      },
    }).evaluate(requestWith(booleanQuestion));

    expect(sent).toBe("jev-1.13.0");
  });
});

describe("jev response translation", () => {
  it("carries a choice distribution across unchanged", async () => {
    const result = await evaluatorFor(
      respondWith({ say_this_selection: jevChoiceAnswer }),
    ).evaluate(requestWith(choiceQuestion));

    expect(result.answers[0]).toEqual({
      choice: "candidate_1",
      confidence: 0.74,
      id: "say_this_selection",
      probabilities: { abstain: 0.1, candidate_1: 0.6, candidate_2: 0.3 },
      type: "choice",
    });
  });

  it("re-keys score probabilities from rubric position to declared level", async () => {
    const result = await evaluatorFor(
      respondWith({ grounding: jevScoreAnswer }),
    ).evaluate(requestWith(scoreQuestion));

    expect(result.answers[0]).toMatchObject({
      confidence: 0.41,
      id: "grounding",
      probabilities: { "1": 0.05, "2": 0.05, "3": 0.2, "4": 0.5, "5": 0.2 },
      type: "score",
    });
  });

  it("normalizes Jev's one-percent probability rounding before contract validation", async () => {
    const result = await evaluatorFor(
      respondWith({
        grounding: {
          ...jevScoreAnswer,
          probabilities: {
            "0": 0,
            "1": 0.01,
            "2": 0.11,
            "3": 0.44,
            "4": 0.43,
          },
        },
      }),
    ).evaluate(requestWith(scoreQuestion));
    const answer = result.answers[0];

    if (answer?.type !== "score") {
      throw new Error("expected a score answer");
    }

    expect(
      Object.values(answer.probabilities).reduce(
        (total, probability) => total + probability,
        0,
      ),
    ).toBeCloseTo(1, 10);
  });

  it("reports the modal level, and keeps Jev's own score recoverable", async () => {
    const result = await evaluatorFor(
      respondWith({ grounding: jevScoreAnswer }),
    ).evaluate(requestWith(scoreQuestion));

    const answer = result.answers[0];

    if (answer?.type !== "score") {
      throw new Error("expected a score answer");
    }

    // Level 4 carries the most mass; Jev reported 2.75 on its own zero-based
    // scale, which is 3.75 once the levels are named 1–5.
    expect(answer.score).toBe(4);
    expect(expectedDecisionScore(scoreQuestion, answer)).toBeCloseTo(3.75, 10);
  });

  it("breaks a tie on the lower level so the mapping is deterministic", async () => {
    const tied = {
      confidence: 0.2,
      probabilities: { "0": 0.5, "1": 0.5 },
      score: 0.5,
      type: "score",
    };
    const question: DecisionScoreQuestion = {
      ...scoreQuestion,
      levels: [1, 2],
    };

    const result = await evaluatorFor(
      respondWith({ grounding: tied }),
    ).evaluate(requestWith(question));

    expect(result.answers[0]).toMatchObject({ score: 1 });
  });

  it("returns a noul as a probability with no verdict attached", async () => {
    const result = await evaluatorFor(
      respondWith({ answerable: jevNoulAnswer }),
    ).evaluate(requestWith(booleanQuestion));

    // Jev reports neither a verdict nor a confidence, and the adapter declines
    // to invent either: choosing the cut-off is the caller's job (ADR-0005).
    expect(result.answers[0]).toEqual({
      id: "answerable",
      probability: 0.83,
      type: "boolean",
    });
  });

  it("answers every question type in one pass", async () => {
    const result = await evaluatorFor(
      respondWith({
        answerable: jevNoulAnswer,
        grounding: jevScoreAnswer,
        say_this_selection: jevChoiceAnswer,
      }),
    ).evaluate(requestWith(choiceQuestion, scoreQuestion, booleanQuestion));

    // Ordered by the questions asked, not by the order Jev keyed them.
    expect(result.answers.map((answer) => answer.id)).toEqual([
      "say_this_selection",
      "grounding",
      "answerable",
    ]);
  });
});

describe("jev responses the adapter refuses", () => {
  it("rejects a two-percent deficit rather than treating it as rounding", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(
          respondWith({
            grounding: {
              ...jevScoreAnswer,
              probabilities: {
                "0": 0,
                "1": 0.01,
                "2": 0.11,
                "3": 0.44,
                "4": 0.42,
              },
            },
          }),
        ).evaluate(requestWith(scoreQuestion)),
      ),
    ).toBe("invalid_output");
  });

  it("rejects a distribution that does not sum to one", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(
          respondWith({
            say_this_selection: {
              ...jevChoiceAnswer,
              probabilities: {
                abstain: 0.1,
                candidate_1: 0.2,
                candidate_2: 0.3,
              },
            },
          }),
        ).evaluate(requestWith(choiceQuestion)),
      ),
    ).toBe("invalid_output");
  });

  it("rejects a choice that names an option the question never declared", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(
          respondWith({
            say_this_selection: { ...jevChoiceAnswer, choice: "candidate_9" },
          }),
        ).evaluate(requestWith(choiceQuestion)),
      ),
    ).toBe("invalid_output");
  });

  it("rejects a distribution over a different option set", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(
          respondWith({
            say_this_selection: {
              ...jevChoiceAnswer,
              probabilities: { candidate_1: 0.6, candidate_9: 0.4 },
            },
          }),
        ).evaluate(requestWith(choiceQuestion)),
      ),
    ).toBe("invalid_output");
  });

  it("rejects a score distribution missing a rubric position", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(
          respondWith({
            grounding: {
              ...jevScoreAnswer,
              probabilities: { "0": 0.5, "1": 0.5 },
            },
          }),
        ).evaluate(requestWith(scoreQuestion)),
      ),
    ).toBe("invalid_output");
  });

  it("rejects a probability outside the unit interval", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(
          respondWith({ answerable: { noul: 1.4, type: "noul" } }),
        ).evaluate(requestWith(booleanQuestion)),
      ),
    ).toBe("invalid_output");
  });

  it("rejects an answer of the wrong type for the question", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(respondWith({ answerable: jevChoiceAnswer })).evaluate(
          requestWith(booleanQuestion),
        ),
      ),
    ).toBe("invalid_output");
  });

  it("rejects a response missing an answer to a question we asked", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(
          respondWith({ say_this_selection: jevChoiceAnswer }),
        ).evaluate(requestWith(choiceQuestion, booleanQuestion)),
      ),
    ).toBe("invalid_output");
  });

  it("rejects an answer to a question we never asked", async () => {
    // Not a harmless extra: it means the two sides disagree about what was
    // evaluated, and an aggregate over the rest would hide that.
    expect(
      await codeOf(() =>
        evaluatorFor(
          respondWith({
            answerable: jevNoulAnswer,
            unasked: jevNoulAnswer,
          }),
        ).evaluate(requestWith(booleanQuestion)),
      ),
    ).toBe("invalid_output");
  });

  it("rejects a response that is not a system one result at all", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(async () => null).evaluate(requestWith(booleanQuestion)),
      ),
    ).toBe("invalid_output");
  });
});

describe("jev failures", () => {
  it("reports a rejected key as configuration rather than an outage", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(failWith(apiError(401))).evaluate(
          requestWith(booleanQuestion),
        ),
      ),
    ).toBe("configuration");
  });

  it("reports a denied account as configuration", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(failWith(apiError(403))).evaluate(
          requestWith(booleanQuestion),
        ),
      ),
    ).toBe("configuration");
  });

  it("reports a rejected question as our own invalid request", async () => {
    for (const status of [400, 422]) {
      expect(
        await codeOf(() =>
          evaluatorFor(failWith(apiError(status))).evaluate(
            requestWith(booleanQuestion),
          ),
        ),
      ).toBe("invalid_request");
    }
  });

  it("reports a rate limit as retryable rate limiting", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(failWith(apiError(429))).evaluate(
          requestWith(booleanQuestion),
        ),
      ),
    ).toBe("rate_limited");
  });

  it("reports an overloaded or failing server as unavailable", async () => {
    for (const status of [500, 529]) {
      expect(
        await codeOf(() =>
          evaluatorFor(failWith(apiError(status))).evaluate(
            requestWith(booleanQuestion),
          ),
        ),
      ).toBe("provider_unavailable");
    }
  });

  it("reports our own expired deadline as a timeout, not an outage", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(failWith(new APITimeoutError(5_000))).evaluate(
          requestWith(booleanQuestion),
        ),
      ),
    ).toBe("timeout");

    expect(
      await codeOf(() =>
        evaluatorFor(failWith(new APIUserAbortError())).evaluate(
          requestWith(booleanQuestion),
        ),
      ),
    ).toBe("timeout");

    expect(
      await codeOf(() =>
        evaluatorFor(failWith(apiError(408))).evaluate(
          requestWith(booleanQuestion),
        ),
      ),
    ).toBe("timeout");
  });

  it("reports a transport failure as unavailable", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(
          failWith(new APIConnectionError("socket closed")),
        ).evaluate(requestWith(booleanQuestion)),
      ),
    ).toBe("provider_unavailable");
  });

  it("reports an SDK-side rejection as configuration", async () => {
    expect(
      await codeOf(() =>
        evaluatorFor(failWith(new TypeSafeError("no api key"))).evaluate(
          requestWith(booleanQuestion),
        ),
      ),
    ).toBe("configuration");
  });

  it("refuses to construct without a key rather than failing per request", () => {
    expect(() => new JevDecisionEvaluator({ apiKey: "  " })).toThrow(
      DecisionEvaluatorError,
    );
    expect(() => new JevDecisionEvaluator()).toThrow(DecisionEvaluatorError);
  });

  it("puts nothing from the request or the response in the error it throws", async () => {
    let thrown: unknown;

    try {
      await evaluatorFor(
        failWith(
          APIError.fromResponse(
            400,
            { echoed_state: state },
            new Headers({ authorization: "Bearer secret-key" }),
          ),
        ),
      ).evaluate(requestWith(booleanQuestion));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DecisionEvaluatorError);
    expect((thrown as Error).message).toBe(
      "Decision evaluation failed: invalid_request.",
    );
    expect(JSON.stringify(thrown)).not.toContain("架空精密工業");
    expect(JSON.stringify(thrown)).not.toContain("secret-key");
  });
});

describe("jev client posture", () => {
  it("disables SDK logging, because the state carries Personal Context", () => {
    // The SDK logs headers and response bodies at `debug`; an operator who set
    // TYPESAFE_LOG_LEVEL=debug for their own code must not thereby start
    // writing a user's context to a log.
    expect(createJevClient("test-key", undefined, 5_000).logLevel).toBe("off");
  });

  it("leaves retrying to the caller, like every other provider client", () => {
    expect(createJevClient("test-key", undefined, 5_000).retry.maxRetries).toBe(
      0,
    );
  });

  it("bounds every attempt with the timeout it was given", () => {
    expect(createJevClient("test-key", undefined, 1_234).timeout).toBe(1_234);
  });

  it("honours a base url override and defaults without one", () => {
    expect(createJevClient("test-key", undefined, 5_000).baseURL).toBe(
      "https://api.typesafe.ai",
    );
    expect(
      createJevClient("test-key", "https://jev.internal.invalid", 5_000)
        .baseURL,
    ).toBe("https://jev.internal.invalid");
  });
});

describe("jev rubric translation", () => {
  it("sends the caller's own text as the choice criteria", () => {
    const questions = toJevQuestions(
      requestWith({
        ...choiceQuestion,
        optionDescriptions: {
          abstain: "None of these is worth asking.",
          candidate_1: "Asks how inventory is run today.",
          candidate_2: "Asks how large the discrepancy problem is.",
        },
      }),
    );

    expect(questions["say_this_selection"]).toMatchObject({
      criteria: {
        abstain: "None of these is worth asking.",
        candidate_1: "Asks how inventory is run today.",
        candidate_2: "Asks how large the discrepancy problem is.",
      },
    });
  });

  it("sends a described scale as an ordered rubric", () => {
    // This is the translation that makes a score question worth asking at all:
    // "1 to 5" and a written rubric are not the same question.
    const questions = toJevQuestions(
      requestWith({
        ...scoreQuestion,
        levelDescriptions: {
          "1": "Ungrounded.",
          "2": "Mostly inferred.",
          "3": "Traceable, one unlabelled inference.",
          "4": "Traceable, every inference labelled.",
          "5": "Read directly from a supplied source.",
        },
      }),
    );

    expect(questions["grounding"]).toMatchObject({
      criteria: [
        "Ungrounded.",
        "Mostly inferred.",
        "Traceable, one unlabelled inference.",
        "Traceable, every inference labelled.",
        "Read directly from a supplied source.",
      ],
    });
  });

  it("leaves an undescribed label undescribed rather than inventing text", () => {
    const questions = toJevQuestions(requestWith(choiceQuestion));

    expect(questions["say_this_selection"]).toMatchObject({
      criteria: { abstain: null, candidate_1: null, candidate_2: null },
    });
  });

  it("re-keys a described scale's answer the same way as an undescribed one", async () => {
    const described = {
      ...scoreQuestion,
      levelDescriptions: {
        "1": "Ungrounded.",
        "2": "Mostly inferred.",
        "3": "Traceable, one unlabelled inference.",
        "4": "Traceable, every inference labelled.",
        "5": "Read directly from a supplied source.",
      },
    };

    const result = await evaluatorFor(
      respondWith({ grounding: jevScoreAnswer }),
    ).evaluate(requestWith(described));

    expect(result.answers[0]).toMatchObject({
      probabilities: { "1": 0.05, "2": 0.05, "3": 0.2, "4": 0.5, "5": 0.2 },
      score: 4,
    });
  });
});
