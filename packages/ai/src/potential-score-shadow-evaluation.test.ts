import type { FlashBriefInput, FlashBriefPublic } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import { DecisionEvaluatorError } from "./decision-evaluator";
import {
  fakeScoreAnswer,
  FakeDecisionEvaluator,
} from "./decision-evaluator.fixture";
import { potentialScoreLevelDescriptions } from "./potential-score-rubric";
import {
  buildPotentialScoreShadowEvaluationRequest,
  buildPotentialScoreShadowEvaluationState,
  evaluatePotentialScoreInShadow,
  potentialScoreQuestionId,
  potentialScoreShadowQuestion,
} from "./potential-score-shadow-evaluation";
import { JevDecisionEvaluator } from "./providers/jev-decision-evaluator";

/** Invented card and context data, per AGENTS.md. */

const input: FlashBriefInput = {
  card: {
    company: "架空精密工業株式会社",
    department: "情報システム課",
    email: "sato.kenichi@kakuu-seimitsu.invalid",
    language: "ja",
    name: "佐藤 健一",
    phone: "03-0000-0000",
    title: "課長",
    website: "https://kakuu-seimitsu.invalid",
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
    ],
  },
};

const brief: FlashBriefPublic = {
  connection_keywords: ["在庫管理", "製造業"],
  identity_status: "medium_confidence",
  potential: "現場の在庫管理課題に直接関わる立場である可能性が高い。",
  potential_score: 4,
  say_this: ["現在の在庫管理はどのように運用されていますか？"],
  who: "架空精密工業の情報システム課長。",
  why_you: "製造業向け在庫管理SaaSの提案経験が課題に噛み合う可能性がある。",
  why_you_claim_type: "hypothesis",
};

const request = { brief, input };

function evaluatorScoring(score: number): FakeDecisionEvaluator {
  return new FakeDecisionEvaluator({
    [potentialScoreQuestionId]: fakeScoreAnswer({
      confidence: 0.58,
      id: potentialScoreQuestionId,
      levels: potentialScoreShadowQuestion.levels,
      score,
    }),
  });
}

describe("potential score shadow evaluation state", () => {
  const state = buildPotentialScoreShadowEvaluationState(request);

  it("never shows the evaluator the score it is being asked to produce", () => {
    // The whole measurement rests on this. An evaluator shown the generator's
    // 4 agrees with the 4, and the agreement says nothing about either.
    expect(JSON.stringify(state)).not.toContain("potential_score");
    expect(Object.keys(state)).not.toContain("potential_score");
  });

  it("sends the sentences being rated and the context they rest on", () => {
    expect(state["potential"]).toBe(brief.potential);
    expect(state["why_you"]).toBe(brief.why_you);
    expect(state["connection_keywords"]).toEqual(["在庫管理", "製造業"]);
  });

  it("never carries a way to contact anybody", () => {
    const serialized = JSON.stringify(state);

    for (const secret of [
      "sato.kenichi@kakuu-seimitsu.invalid",
      "03-0000-0000",
      "https://kakuu-seimitsu.invalid",
      "佐藤 健一",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe("potential score shadow evaluation question", () => {
  it("asks against the same five levels the generator was given", () => {
    expect(potentialScoreShadowQuestion.levelDescriptions).toBe(
      potentialScoreLevelDescriptions,
    );
    expect(potentialScoreShadowQuestion.levels).toEqual([1, 2, 3, 4, 5]);
  });

  it("builds a request the contract accepts", () => {
    expect(
      buildPotentialScoreShadowEvaluationRequest(request).questions,
    ).toHaveLength(1);
  });
});

describe("potential score shadow evaluation result", () => {
  it("returns both scores side by side and judges neither", async () => {
    const evaluation = await evaluatePotentialScoreInShadow(
      evaluatorScoring(2),
      request,
    );

    expect(evaluation.generatorScore).toBe(4);
    expect(evaluation.modalScore).toBe(2);
    expect(Object.keys(evaluation).sort()).toEqual([
      "confidence",
      "expectedScore",
      "generatorScore",
      "modalScore",
      "probabilities",
    ]);
  });

  it("reports the expected score over the whole distribution", async () => {
    // The fake puts 0.6 on the chosen level and spreads 0.1 over each of the
    // other four: 1(.1) + 2(.6) + 3(.1) + 4(.1) + 5(.1) = 2.5. The modal level
    // is 2, so the two readings of the same answer differ by half a level.
    const evaluation = await evaluatePotentialScoreInShadow(
      evaluatorScoring(2),
      request,
    );

    expect(evaluation.expectedScore).toBeCloseTo(2.5, 10);
  });

  it("does not change the brief it was given", async () => {
    const before = JSON.stringify(brief);

    await evaluatePotentialScoreInShadow(evaluatorScoring(5), request);

    expect(JSON.stringify(brief)).toBe(before);
  });

  it("reads a Jev response end to end, with the rubric attached", async () => {
    let sentCriteria: unknown;

    const evaluator = new JevDecisionEvaluator({
      request: async ({ questions }) => {
        sentCriteria = questions[potentialScoreQuestionId]?.criteria;

        return {
          answers: {
            [potentialScoreQuestionId]: {
              confidence: 0.44,
              // Jev keys a five-level rubric from zero.
              probabilities: {
                "0": 0.05,
                "1": 0.1,
                "2": 0.5,
                "3": 0.3,
                "4": 0.05,
              },
              score: 2.2,
              type: "score",
            },
          },
        };
      },
    });

    const evaluation = await evaluatePotentialScoreInShadow(evaluator, request);

    // The generator's own rubric text reached Jev as the rubric.
    expect(sentCriteria).toEqual([
      potentialScoreLevelDescriptions["1"],
      potentialScoreLevelDescriptions["2"],
      potentialScoreLevelDescriptions["3"],
      potentialScoreLevelDescriptions["4"],
      potentialScoreLevelDescriptions["5"],
    ]);

    // Jev's 2.2 on its zero-based scale is 3.2 once the levels are named 1–5.
    expect(evaluation.modalScore).toBe(3);
    expect(evaluation.expectedScore).toBeCloseTo(3.2, 10);
    expect(evaluation.generatorScore).toBe(4);
  });

  it("still rates a brief stored before the score existed", async () => {
    // `flashBriefPublicSchema` defaults `potential_score` to null for rows
    // written before the field was added. There is nothing to compare against,
    // and inventing a number to compare against would be worse than a null.
    const evaluation = await evaluatePotentialScoreInShadow(
      evaluatorScoring(3),
      { brief: { ...brief, potential_score: null }, input },
    );

    expect(evaluation.generatorScore).toBeNull();
    expect(evaluation.modalScore).toBe(3);
  });

  it("refuses a result that answered something else", async () => {
    const evaluator = new FakeDecisionEvaluator({
      [potentialScoreQuestionId]: fakeScoreAnswer({
        confidence: 0.5,
        id: potentialScoreQuestionId,
        levels: [1, 2, 3],
        score: 2,
      }),
    });

    await expect(
      evaluatePotentialScoreInShadow(evaluator, request),
    ).rejects.toBeInstanceOf(DecisionEvaluatorError);
  });
});
