import type { FlashBriefInput, FlashBriefPublic } from "@miraio/domain";
import { evalDimensions } from "@miraio/test-fixtures";
import { describe, expect, it } from "vitest";

import {
  BriefJudgeError,
  judgeDimensions,
  normalizeBriefJudgement,
  OpenAIBriefJudge,
  type BriefJudgementStructuredOutput,
} from "./brief-judge";

const input: FlashBriefInput = {
  card: {
    company: "架空精密工業株式会社",
    department: "情報システム課",
    language: "ja",
    name: "佐藤 健一",
    title: "課長",
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

function judgementWith(
  scores: BriefJudgementStructuredOutput["scores"],
): BriefJudgementStructuredOutput {
  return { scores, weaknesses: [] };
}

const completeScores = judgeDimensions.map((dimension) => ({
  dimension,
  score: 4,
  reason: `${dimension} is adequate.`,
}));

function judgeReturning(output: unknown): OpenAIBriefJudge {
  return new OpenAIBriefJudge({
    model: "test-model",
    request: async () => output,
  });
}

describe("brief judge", () => {
  it("scores the same eight dimensions the rubric defines", () => {
    // The judge cannot import the rubric at runtime, so drift is caught here.
    expect([...judgeDimensions]).toEqual([...evalDimensions]);
  });

  it("returns every score and the mean across them", async () => {
    const judgement = await judgeReturning(judgementWith(completeScores)).judge(
      { brief, input },
    );

    expect(judgement.scores).toHaveLength(judgeDimensions.length);
    expect(judgement.overall).toBe(4);
    expect(judgement.weaknesses).toEqual([]);
  });

  it("keeps the weaknesses the judge reported", async () => {
    const judgement = await judgeReturning({
      scores: completeScores,
      weaknesses: [
        {
          dimension: "grounding",
          problem: "WHY YOU asserts a budget cycle no source mentions.",
          fix: "Drop the claim or mark it as a hypothesis.",
        },
      ],
    }).judge({ brief, input });

    expect(judgement.weaknesses).toHaveLength(1);
    expect(judgement.weaknesses[0]?.dimension).toBe("grounding");
  });

  it("rejects a judgement that skips a dimension", () => {
    expect(() =>
      normalizeBriefJudgement(judgementWith(completeScores.slice(1))),
    ).toThrow(BriefJudgeError);
  });

  it("rejects a judgement that scores one dimension twice", () => {
    const duplicated = [
      ...completeScores.slice(0, completeScores.length - 1),
      { ...completeScores[0]!, score: 2 },
    ];

    expect(() => normalizeBriefJudgement(judgementWith(duplicated))).toThrow(
      BriefJudgeError,
    );
  });

  it("rejects scores outside the rubric scale", async () => {
    const outOfRange = completeScores.map((score, index) =>
      index === 0 ? { ...score, score: 9 } : score,
    );

    await expect(
      judgeReturning(judgementWith(outOfRange)).judge({ brief, input }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("treats an empty provider response as invalid output", async () => {
    await expect(
      judgeReturning(null).judge({ brief, input }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("requires a model and an API key", () => {
    expect(() => new OpenAIBriefJudge({ model: "  " })).toThrow(
      BriefJudgeError,
    );
    expect(() => new OpenAIBriefJudge({ model: "test-model" })).toThrow(
      BriefJudgeError,
    );
  });

  it("classifies a provider failure rather than leaking it", async () => {
    const judge = new OpenAIBriefJudge({
      model: "test-model",
      request: async () => {
        throw Object.assign(new Error("boom"), { status: 429 });
      },
    });

    await expect(judge.judge({ brief, input })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });
});
