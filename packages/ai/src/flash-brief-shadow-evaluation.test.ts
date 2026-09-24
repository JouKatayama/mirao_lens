import type { FlashBriefInput, FlashBriefPublic } from "@miraio/domain";
import { evalDimensions } from "@miraio/test-fixtures";
import { describe, expect, it } from "vitest";

import {
  briefEvaluationDimensions,
  briefEvaluationScoreLevels,
} from "./brief-evaluation-rubric";
import { judgeDimensions } from "./brief-judge";
import {
  DecisionEvaluatorError,
  normalizeDecisionEvaluationRequest,
  type DecisionAnswer,
  type DecisionEvaluationResult,
} from "./decision-evaluator";
import {
  fakeScoreAnswer,
  FakeDecisionEvaluator,
} from "./decision-evaluator.fixture";
import {
  buildFlashBriefShadowEvaluationRequest,
  buildFlashBriefShadowEvaluationState,
  evaluateFlashBriefInShadow,
  maxShadowPersonalContextItemLength,
  maxShadowPersonalContextItems,
  toFlashBriefShadowEvaluation,
} from "./flash-brief-shadow-evaluation";

const contactEmail = "sato.kenichi@kakuu-seimitsu.invalid";
const contactPhone = "03-0000-0000";
const contactWebsite = "https://kakuu-seimitsu.invalid";

const input: FlashBriefInput = {
  card: {
    company: "架空精密工業株式会社",
    department: "情報システム課",
    email: contactEmail,
    language: "ja",
    name: "佐藤 健一",
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

function scoredResult(
  scores: Readonly<Partial<Record<string, number>>>,
): DecisionEvaluationResult {
  const answers: DecisionAnswer[] = Object.entries(scores).map(
    ([dimension, score]) =>
      fakeScoreAnswer({
        confidence: 0.5,
        id: dimension,
        levels: briefEvaluationScoreLevels,
        score: score ?? 3,
      }),
  );

  return { answers };
}

function evaluatorScoring(score: number): FakeDecisionEvaluator {
  return new FakeDecisionEvaluator(
    Object.fromEntries(
      briefEvaluationDimensions.map((dimension) => [
        dimension,
        fakeScoreAnswer({
          confidence: 0.5,
          id: dimension,
          levels: briefEvaluationScoreLevels,
          score,
        }),
      ]),
    ),
  );
}

describe("flash brief shadow evaluation rubric", () => {
  it("scores the same dimensions as the judge and the human rubric", () => {
    expect([...briefEvaluationDimensions]).toEqual([...evalDimensions]);
    expect([...judgeDimensions]).toEqual([...briefEvaluationDimensions]);
  });

  it("asks one score question per dimension on the 1–5 scale", () => {
    const evaluationRequest = buildFlashBriefShadowEvaluationRequest(request);

    expect(evaluationRequest.questions.map((question) => question.id)).toEqual([
      ...briefEvaluationDimensions,
    ]);

    for (const question of evaluationRequest.questions) {
      expect(question.type).toBe("score");
      expect(question).toMatchObject({ levels: [1, 2, 3, 4, 5] });
    }
  });

  it("produces a request the decision contract accepts", () => {
    expect(() =>
      normalizeDecisionEvaluationRequest(
        buildFlashBriefShadowEvaluationRequest(request),
      ),
    ).not.toThrow();
  });
});

describe("flash brief shadow evaluation state", () => {
  const state = buildFlashBriefShadowEvaluationState(request);
  const serialized = JSON.stringify(state);

  it("carries no email, phone, website or postal address", () => {
    for (const secret of [contactEmail, contactPhone, contactWebsite]) {
      expect(serialized).not.toContain(secret);
    }

    expect(serialized).not.toContain("@");
    expect(serialized).not.toMatch(/email|phone|address|website/i);
  });

  it("carries only the four card fields the rubric needs", () => {
    expect(
      Object.keys(state["card"] as Record<string, unknown>).sort(),
    ).toEqual(["company", "department", "name", "title"]);
  });

  it("carries the generated brief and the meeting goal", () => {
    expect(state["flash_brief"]).toMatchObject({ who: brief.who });
    expect(state["meeting_goal"]).toBe("sales");
    expect(state["locale"]).toBe("ja");
  });

  it("caps and truncates the personal context items it sends", () => {
    const long = "あ".repeat(maxShadowPersonalContextItemLength * 2);
    const crowded = buildFlashBriefShadowEvaluationState({
      brief,
      input: {
        ...input,
        personal_context: {
          ...input.personal_context,
          items: Array.from(
            { length: maxShadowPersonalContextItems + 5 },
            () => ({ tags: [], text: long, type: "expertise" as const }),
          ),
        },
      },
    });

    const context = crowded["personal_context"] as Record<string, unknown>;
    const items = context["items"] as readonly string[];

    expect(items).toHaveLength(maxShadowPersonalContextItems);

    for (const item of items) {
      expect(item.length).toBeLessThanOrEqual(
        maxShadowPersonalContextItemLength,
      );
    }
  });
});

describe("flash brief shadow evaluation result", () => {
  it("returns a score, a distribution and a confidence per dimension", async () => {
    const evaluation = await evaluateFlashBriefInShadow(
      evaluatorScoring(4),
      request,
    );

    expect(evaluation.dimensions.map((entry) => entry.dimension)).toEqual([
      ...briefEvaluationDimensions,
    ]);

    for (const entry of evaluation.dimensions) {
      expect(entry.score).toBe(4);
      expect(entry.confidence).toBe(0.5);
      expect(Object.keys(entry.probabilities).sort()).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
      ]);
    }
  });

  it("averages the eight dimension scores", () => {
    const scores = [5, 4, 4, 3, 3, 2, 2, 1];
    const evaluation = toFlashBriefShadowEvaluation(
      scoredResult(
        Object.fromEntries(
          briefEvaluationDimensions.map((dimension, index) => [
            dimension,
            scores[index],
          ]),
        ),
      ),
    );

    expect(evaluation.overall).toBe(3);
  });

  it("carries no timestamp and no provider name", async () => {
    const evaluation = await evaluateFlashBriefInShadow(
      evaluatorScoring(3),
      request,
    );

    expect(Object.keys(evaluation).sort()).toEqual(["dimensions", "overall"]);
    expect(Object.keys(evaluation.dimensions[0] ?? {}).sort()).toEqual([
      "confidence",
      "dimension",
      "probabilities",
      "score",
    ]);
  });

  it("rejects a result that skips a dimension", () => {
    const partial = scoredResult(
      Object.fromEntries(
        briefEvaluationDimensions
          .slice(1)
          .map((dimension) => [dimension, 3 as number]),
      ),
    );

    expect(() => toFlashBriefShadowEvaluation(partial)).toThrow(
      DecisionEvaluatorError,
    );
  });

  it("rejects a result that scores one dimension twice", () => {
    const complete = scoredResult(
      Object.fromEntries(
        briefEvaluationDimensions.map((dimension) => [dimension, 3 as number]),
      ),
    );
    const duplicated: DecisionEvaluationResult = {
      answers: [...complete.answers.slice(1), complete.answers[1]!],
    };

    expect(() => toFlashBriefShadowEvaluation(duplicated)).toThrow(
      DecisionEvaluatorError,
    );
  });

  it("rejects a dimension answered with the wrong question type", () => {
    const complete = scoredResult(
      Object.fromEntries(
        briefEvaluationDimensions.map((dimension) => [dimension, 3 as number]),
      ),
    );
    const wrongType: DecisionEvaluationResult = {
      answers: [
        {
          confidence: 0.5,
          holds: true,
          id: briefEvaluationDimensions[0],
          probability: 0.5,
          type: "boolean",
        },
        ...complete.answers.slice(1),
      ],
    };

    expect(() => toFlashBriefShadowEvaluation(wrongType)).toThrow(
      DecisionEvaluatorError,
    );
  });

  it("rejects an answer for a dimension the rubric does not define", () => {
    const stranger = scoredResult(
      Object.fromEntries([
        ...briefEvaluationDimensions
          .slice(1)
          .map((dimension) => [dimension, 3 as number]),
        ["tone_of_voice", 3 as number],
      ]),
    );

    expect(() => toFlashBriefShadowEvaluation(stranger)).toThrow(
      DecisionEvaluatorError,
    );
  });
});
