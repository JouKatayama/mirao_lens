import type { FlashBriefInput, FlashBriefPublic } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import { DecisionEvaluatorError } from "./decision-evaluator";
import {
  fakeChoiceAnswer,
  FakeDecisionEvaluator,
} from "./decision-evaluator.fixture";
import { identityStatusOptionDescriptions } from "./identity-status-rubric";
import {
  buildIdentityStatusShadowEvaluationRequest,
  buildIdentityStatusShadowEvaluationState,
  evaluateIdentityStatusInShadow,
  identityStatusQuestionId,
  identityStatusShadowQuestion,
} from "./identity-status-shadow-evaluation";
import { JevDecisionEvaluator } from "./providers/jev-decision-evaluator";

/** Invented card and context data, per AGENTS.md. */

const input: FlashBriefInput = {
  card: {
    company: "架空精密工業株式会社",
    department: "情報システム課",
    email: "Sato.Kenichi@Kakuu-Seimitsu.invalid",
    language: "ja",
    name: "佐藤 健一",
    phone: "03-0000-0000",
    title: "課長",
    website: "https://kakuu-seimitsu.invalid/company/about?ref=card",
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
  connection_keywords: ["在庫管理"],
  identity_status: "medium_confidence",
  potential: "現場の在庫管理課題に直接関わる立場である可能性が高い。",
  potential_score: 4,
  say_this: ["現在の在庫管理はどのように運用されていますか？"],
  who: "架空精密工業の情報システム課長。",
  why_you: "製造業向け在庫管理SaaSの提案経験が課題に噛み合う可能性がある。",
  why_you_claim_type: "hypothesis",
};

const request = { brief, input };

function evaluatorChoosing(choice: string): FakeDecisionEvaluator {
  return new FakeDecisionEvaluator({
    [identityStatusQuestionId]: fakeChoiceAnswer({
      choice,
      confidence: 0.61,
      id: identityStatusQuestionId,
      options: identityStatusShadowQuestion.options,
    }),
  });
}

describe("identity status shadow evaluation state", () => {
  const state = buildIdentityStatusShadowEvaluationState(request);
  const card = state["card"] as Record<string, unknown>;

  it("never shows the evaluator the status it is being asked to produce", () => {
    expect(JSON.stringify(state)).not.toContain("identity_status");
    expect(JSON.stringify(state)).not.toContain("medium_confidence");
  });

  it("leaves the prior status out, so the card is assessed on its own", () => {
    expect(JSON.stringify(state)).not.toContain("prior_identity_status");
  });

  it("sends the shape of the name rather than the name", () => {
    // The definitions turn on whether a full name is present, never on who it
    // belongs to.
    expect(card["name"]).toBe("a full name is present on the card");
    expect(JSON.stringify(state)).not.toContain("佐藤");
  });

  it("classifies a single-token and an absent name", () => {
    for (const [name, expected] of [
      ["佐藤", "only a single name token is present on the card"],
      ["  ", "no name is present on the card"],
      [null, "no name is present on the card"],
    ] as const) {
      const other = buildIdentityStatusShadowEvaluationState({
        ...request,
        input: { ...input, card: { ...input.card, name } },
      })["card"] as Record<string, unknown>;

      expect(other["name"]).toBe(expected);
    }
  });

  it("sends the email domain without the local part", () => {
    // The domain is what "email domain matches company domain" needs; the
    // local part is just the person's name again.
    expect(card["email_domain"]).toBe("kakuu-seimitsu.invalid");
    expect(JSON.stringify(state)).not.toContain("Sato.Kenichi");
  });

  it("sends the website host without the path it came with", () => {
    expect(card["website_host"]).toBe("kakuu-seimitsu.invalid");
    expect(JSON.stringify(state)).not.toContain("ref=card");
  });

  it("accepts a bare host as readily as a url", () => {
    const bare = buildIdentityStatusShadowEvaluationState({
      ...request,
      input: {
        ...input,
        card: { ...input.card, website: "kakuu-seimitsu.invalid" },
      },
    })["card"] as Record<string, unknown>;

    expect(bare["website_host"]).toBe("kakuu-seimitsu.invalid");
  });

  it("carries no phone and no personal context at all", () => {
    const serialized = JSON.stringify(state);

    expect(serialized).not.toContain("03-0000-0000");
    expect(serialized).not.toContain("法人営業");
    expect(serialized).not.toContain("製造業向け在庫管理SaaS");
  });
});

describe("identity status shadow evaluation question", () => {
  it("offers the four values with the generator's own definitions", () => {
    expect(identityStatusShadowQuestion.optionDescriptions).toBe(
      identityStatusOptionDescriptions,
    );
    expect(identityStatusShadowQuestion.options).toEqual([
      "high_confidence",
      "medium_confidence",
      "unresolved",
      "verified",
    ]);
  });

  it("builds a request the contract accepts", () => {
    expect(
      buildIdentityStatusShadowEvaluationRequest(request).questions,
    ).toHaveLength(1);
  });
});

describe("identity status shadow evaluation result", () => {
  it("returns both assessments side by side and judges neither", async () => {
    const evaluation = await evaluateIdentityStatusInShadow(
      evaluatorChoosing("unresolved"),
      request,
    );

    expect(evaluation.generatorStatus).toBe("medium_confidence");
    expect(evaluation.modalStatus).toBe("unresolved");
    expect(Object.keys(evaluation).sort()).toEqual([
      "confidence",
      "generatorStatus",
      "modalStatus",
      "probabilities",
      "verifiedProbability",
    ]);
  });

  it("surfaces mass on a label the card data cannot establish", async () => {
    const evaluation = await evaluateIdentityStatusInShadow(
      evaluatorChoosing("high_confidence"),
      request,
    );

    // The fake spreads the remainder evenly, so `verified` gets a share here.
    // In a real run anything meaningfully above zero is the finding.
    expect(evaluation.verifiedProbability).toBe(
      evaluation.probabilities.verified,
    );
  });

  it("does not change the brief it was given", async () => {
    const before = JSON.stringify(brief);

    await evaluateIdentityStatusInShadow(
      evaluatorChoosing("unresolved"),
      request,
    );

    expect(JSON.stringify(brief)).toBe(before);
  });

  it("reads a Jev response end to end, with the definitions attached", async () => {
    let sentCriteria: unknown;

    const evaluator = new JevDecisionEvaluator({
      request: async ({ questions }) => {
        sentCriteria = questions[identityStatusQuestionId]?.criteria;

        return {
          answers: {
            [identityStatusQuestionId]: {
              choice: "medium_confidence",
              confidence: 0.71,
              probabilities: {
                high_confidence: 0.18,
                medium_confidence: 0.7,
                unresolved: 0.12,
                verified: 0,
              },
              type: "choice",
            },
          },
        };
      },
    });

    const evaluation = await evaluateIdentityStatusInShadow(evaluator, request);

    expect(sentCriteria).toEqual(identityStatusOptionDescriptions);
    expect(evaluation.modalStatus).toBe("medium_confidence");
    expect(evaluation.probabilities.high_confidence).toBe(0.18);
    expect(evaluation.verifiedProbability).toBe(0);
  });

  it("refuses a distribution over a different label set", async () => {
    const evaluator = new FakeDecisionEvaluator({
      [identityStatusQuestionId]: fakeChoiceAnswer({
        choice: "unresolved",
        confidence: 0.5,
        id: identityStatusQuestionId,
        options: ["unresolved", "medium_confidence"],
      }),
    });

    await expect(
      evaluateIdentityStatusInShadow(evaluator, request),
    ).rejects.toBeInstanceOf(DecisionEvaluatorError);
  });
});
