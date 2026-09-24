import type { FlashBriefInput } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  DecisionEvaluatorError,
  type DecisionAnswer,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
} from "./decision-evaluator";
import { fakeChoiceAnswer } from "./decision-evaluator.fixture";
import {
  maxShadowPersonalContextItemLength,
  maxShadowPersonalContextItems,
} from "./flash-brief-shadow-evaluation";
import { JevDecisionEvaluator } from "./providers/jev-decision-evaluator";
import {
  buildSayThisShadowEvaluationQuestions,
  buildSayThisShadowEvaluationRequest,
  buildSayThisShadowEvaluationState,
  evaluateSayThisInShadow,
  maxSayThisCandidateLength,
  maxSayThisCandidates,
  sayThisAbstainOption,
  sayThisSelectionQuestionId,
  sayThisShadowDimensions,
  toSayThisCandidateId,
  toSayThisDimensionQuestionId,
} from "./say-this-shadow-evaluation";

/** Invented card and context data, per AGENTS.md. Nothing here is real. */

const contactEmail = "sato.kenichi@kakuu-seimitsu.invalid";
const contactPhone = "03-0000-0000";
const contactWebsite = "https://kakuu-seimitsu.invalid";
const contactName = "佐藤 健一";

const input: FlashBriefInput = {
  card: {
    company: "架空精密工業株式会社",
    department: "情報システム課",
    email: contactEmail,
    language: "ja",
    name: contactName,
    phone: contactPhone,
    title: "課長",
    website: contactWebsite,
  },
  locale: "ja",
  meeting_goal: "sales",
  personal_context: {
    current_company: "架空クラウド株式会社",
    current_role: "法人営業",
    items: [
      {
        tags: ["SaaS"],
        text: "製造業向け在庫管理SaaSの導入提案を担当している",
        type: "expertise",
      },
      {
        tags: ["製造業"],
        text: "現場の在庫差異をなくす案件を探している",
        type: "seeking",
      },
    ],
  },
};

const candidates = [
  "現在の在庫管理はどのように運用されていますか？",
  "情報システム課から見て、現場の在庫差異はどのくらい課題になっていますか？",
];

const request = { candidates, input };

function booleanAnswer(id: string, probability: number): DecisionAnswer {
  return { id, probability, type: "boolean" };
}

/**
 * A full, contract-valid set of answers for the request above: one selection
 * and one probability per candidate per dimension.
 */
function answersFor(
  choice: string,
  dimensionProbability = 0.7,
): DecisionAnswer[] {
  const evaluationRequest = buildSayThisShadowEvaluationRequest(request);
  const selection = evaluationRequest.questions[0];

  if (selection?.type !== "choice") {
    throw new Error("expected the selection question first");
  }

  return [
    fakeChoiceAnswer({
      choice,
      confidence: 0.66,
      id: sayThisSelectionQuestionId,
      options: selection.options,
    }),
    ...candidates.flatMap((_unused, index) =>
      sayThisShadowDimensions.map((dimension) =>
        booleanAnswer(
          toSayThisDimensionQuestionId(toSayThisCandidateId(index), dimension),
          dimensionProbability,
        ),
      ),
    ),
  ];
}

function evaluatorReturning(answers: readonly DecisionAnswer[]) {
  return {
    async evaluate(): Promise<DecisionEvaluationResult> {
      return { answers: [...answers] };
    },
  } satisfies DecisionEvaluator;
}

describe("say this shadow evaluation state", () => {
  const state = buildSayThisShadowEvaluationState(request);

  it("sends the candidates under stable ids", () => {
    expect(state["candidates"]).toEqual([
      { id: "candidate_1", text: candidates[0] },
      { id: "candidate_2", text: candidates[1] },
    ]);
  });

  it("sends the role that would answer, not the person who holds it", () => {
    // Judging whether a question is answerable needs the job, not the name.
    expect(state["card"]).toEqual({
      company: "架空精密工業株式会社",
      department: "情報システム課",
      title: "課長",
    });
  });

  it("never carries a way to contact anybody", () => {
    const serialized = JSON.stringify(state);

    for (const secret of [
      contactEmail,
      contactName,
      contactPhone,
      contactWebsite,
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("caps and truncates the personal context it forwards", () => {
    const many = {
      ...request,
      input: {
        ...input,
        personal_context: {
          ...input.personal_context,
          items: Array.from(
            { length: maxShadowPersonalContextItems + 4 },
            () => ({
              tags: [],
              text: "あ".repeat(maxShadowPersonalContextItemLength + 50),
              type: "expertise" as const,
            }),
          ),
        },
      },
    };

    const context = buildSayThisShadowEvaluationState(many)[
      "personal_context"
    ] as { items: string[] };

    expect(context.items).toHaveLength(maxShadowPersonalContextItems);

    for (const item of context.items) {
      expect(item.length).toBeLessThanOrEqual(
        maxShadowPersonalContextItemLength,
      );
    }
  });

  it("truncates a candidate to the length the domain already allows", () => {
    const long = buildSayThisShadowEvaluationState({
      ...request,
      candidates: ["ア".repeat(maxSayThisCandidateLength + 100)],
    })["candidates"] as { text: string }[];

    expect(long[0]?.text).toHaveLength(maxSayThisCandidateLength);
  });
});

describe("say this shadow evaluation questions", () => {
  it("offers every candidate and an abstain option", () => {
    const [selection] = buildSayThisShadowEvaluationQuestions(3);

    expect(selection).toMatchObject({
      id: sayThisSelectionQuestionId,
      options: ["candidate_1", "candidate_2", "candidate_3", "abstain"],
      type: "choice",
    });
  });

  it("asks each proposition about each candidate separately", () => {
    const questions = buildSayThisShadowEvaluationQuestions(2);

    // One "answerable" number spread across two different questions would
    // describe neither of them.
    expect(questions).toHaveLength(1 + 2 * sayThisShadowDimensions.length);
    expect(
      questions.filter((question) => question.type === "boolean").length,
    ).toBe(2 * sayThisShadowDimensions.length);
    expect(questions.map((question) => question.id)).toContain(
      "candidate_2.grounded",
    );
  });

  it("builds a request the contract accepts", () => {
    const evaluationRequest: DecisionEvaluationRequest =
      buildSayThisShadowEvaluationRequest(request);

    expect(evaluationRequest.questions).toHaveLength(
      1 + candidates.length * sayThisShadowDimensions.length,
    );
  });

  it("refuses a candidate set it cannot evaluate", () => {
    for (const broken of [
      [],
      ["  "],
      Array.from({ length: maxSayThisCandidates + 1 }, () => "質問"),
    ]) {
      expect(() =>
        buildSayThisShadowEvaluationRequest({ ...request, candidates: broken }),
      ).toThrow(DecisionEvaluatorError);
    }
  });
});

describe("say this shadow evaluation result", () => {
  it("reports a probability per candidate and per proposition", async () => {
    const evaluation = await evaluateSayThisInShadow(
      evaluatorReturning(answersFor("candidate_1")),
      request,
    );

    expect(evaluation.selected).toBe("candidate_1");
    expect(evaluation.selectionConfidence).toBe(0.66);
    expect(evaluation.candidates).toHaveLength(2);
    expect(evaluation.candidates[0]).toMatchObject({
      dimensions: {
        advances_conversation: 0.7,
        answerable: 0.7,
        context_relevance: 0.7,
        grounded: 0.7,
        natural_tone: 0.7,
      },
      id: "candidate_1",
      index: 0,
    });
  });

  it("reports abstaining as an outcome rather than as a failure", async () => {
    const evaluation = await evaluateSayThisInShadow(
      evaluatorReturning(answersFor(sayThisAbstainOption)),
      request,
    );

    expect(evaluation.selected).toBe(sayThisAbstainOption);
    expect(evaluation.abstainProbability).toBeGreaterThan(0);
  });

  it("crosses no threshold and returns no verdict", async () => {
    const evaluation = await evaluateSayThisInShadow(
      evaluatorReturning(answersFor("candidate_1")),
      request,
    );

    // Everything reported is a probability. Turning one into "ask this" is a
    // product decision that nothing here is allowed to make.
    for (const candidate of evaluation.candidates) {
      for (const value of Object.values(candidate.dimensions)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }

    expect(Object.keys(evaluation).sort()).toEqual([
      "abstainProbability",
      "candidates",
      "selected",
      "selectionConfidence",
    ]);
  });

  it("refuses a result missing a proposition it asked about", async () => {
    const partial = answersFor("candidate_1").filter(
      (answer) => answer.id !== "candidate_2.grounded",
    );

    await expect(
      evaluateSayThisInShadow(evaluatorReturning(partial), request),
    ).rejects.toBeInstanceOf(DecisionEvaluatorError);
  });

  it("refuses a selection scored over the wrong candidate set", async () => {
    const answers = answersFor("candidate_1").map((answer) =>
      answer.id === sayThisSelectionQuestionId
        ? fakeChoiceAnswer({
            choice: "candidate_1",
            confidence: 0.5,
            id: sayThisSelectionQuestionId,
            options: ["candidate_1", "candidate_2", "candidate_3", "abstain"],
          })
        : answer,
    );

    await expect(
      evaluateSayThisInShadow(evaluatorReturning(answers), request),
    ).rejects.toBeInstanceOf(DecisionEvaluatorError);
  });
});

describe("say this shadow evaluation over the jev adapter", () => {
  /** The two halves meeting, with a canned Jev response and no network. */
  it("reads a Jev system one response end to end", async () => {
    const evaluator = new JevDecisionEvaluator({
      request: async ({ questions }) => ({
        answers: Object.fromEntries(
          Object.entries(questions).map(([name, question]) =>
            question.type === "choice"
              ? [
                  name,
                  {
                    choice: "candidate_2",
                    confidence: 0.81,
                    probabilities: {
                      abstain: 0.05,
                      candidate_1: 0.2,
                      candidate_2: 0.75,
                    },
                    type: "choice",
                  },
                ]
              : [name, { noul: 0.64, type: "noul" }],
          ),
        ),
        model: "jev-1.13.0",
        usage: { input_tokens: 412, output_tokens: 66 },
      }),
    });

    const evaluation = await evaluateSayThisInShadow(evaluator, request);

    expect(evaluation.selected).toBe("candidate_2");
    expect(evaluation.candidates[1]?.selectionProbability).toBe(0.75);
    expect(evaluation.candidates[1]?.dimensions.answerable).toBe(0.64);
  });

  it("fails on its own without touching what the caller already has", async () => {
    // The Flash Brief is generated and returned before this runs, and this
    // function has no side effect: a Jev outage costs the measurement and
    // nothing else. A caller keeps its brief by discarding the rejection.
    const before = JSON.stringify(request);
    const evaluator = new JevDecisionEvaluator({
      request: async () => {
        throw new Error("jev is down");
      },
    });

    await expect(
      evaluateSayThisInShadow(evaluator, request),
    ).rejects.toMatchObject({ code: "provider_unavailable" });

    expect(JSON.stringify(request)).toBe(before);
  });
});
