import type { CardExtraction } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import { FakeDecisionEvaluator } from "./decision-evaluator.fixture";
import {
  buildCardLikenessShadowRequest,
  evaluateCardLikenessInShadow,
} from "./card-likeness-shadow-evaluation";

const extraction: CardExtraction = {
  address: null,
  company: "架空株式会社",
  department: "研究部",
  email: "sample@example.invalid",
  field_confidence: {
    address: 0,
    company: 0.95,
    department: 0.8,
    email: 0.9,
    name: 0.98,
    phone: 0,
    title: 0.9,
    website: 0,
  },
  language: "ja",
  name: "未来 太郎",
  phone: null,
  title: "研究員",
  website: null,
};

describe("card likeness shadow evaluation", () => {
  it("asks one closed question using field shape without personal data", () => {
    const request = buildCardLikenessShadowRequest(extraction);

    expect(request.questions).toHaveLength(1);
    expect(request.questions[0]?.type).toBe("boolean");
    expect(request.state).toEqual({
      fields: {
        address: { present: false, confidence: 0 },
        company: { present: true, confidence: 0.95 },
        department: { present: true, confidence: 0.8 },
        email: { present: true, confidence: 0.9 },
        name: { present: true, confidence: 0.98 },
        phone: { present: false, confidence: 0 },
        title: { present: true, confidence: 0.9 },
        website: { present: false, confidence: 0 },
      },
    });
    expect(JSON.stringify(request)).not.toContain("未来");
    expect(JSON.stringify(request)).not.toContain("example.invalid");
  });

  it("returns probability without turning it into a gate", async () => {
    const evaluation = await evaluateCardLikenessInShadow(
      new FakeDecisionEvaluator({
        is_business_card: {
          id: "is_business_card",
          probability: 0.72,
          type: "boolean",
        },
      }),
      extraction,
    );

    expect(evaluation).toEqual({ probability: 0.72 });
  });
});
