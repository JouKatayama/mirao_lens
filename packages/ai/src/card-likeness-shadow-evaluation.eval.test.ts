import type { CardExtraction, CardFieldName } from "@miraio/domain";
import { describe, it } from "vitest";

import { evaluateCardLikenessInShadow } from "./card-likeness-shadow-evaluation";
import { JevDecisionEvaluator } from "./providers/jev-decision-evaluator";

/**
 * Optional, synthetic-only measurement:
 * MIRAIO_RUN_CARD_LIKENESS_SHADOW=1 TYPESAFE_API_KEY=<key>
 * pnpm --filter @miraio/ai exec vitest run
 * src/card-likeness-shadow-evaluation.eval.test.ts --disable-console-intercept
 */
const runShadow =
  process.env.MIRAIO_RUN_CARD_LIKENESS_SHADOW === "1" &&
  Boolean(process.env.TYPESAFE_API_KEY?.trim());

const cases: readonly Readonly<{
  name: string;
  expected: "card" | "other";
  fields: readonly CardFieldName[];
}>[] = [
  {
    name: "person-and-company",
    expected: "card",
    fields: ["name", "company", "department", "title", "email"],
  },
  {
    name: "minimal-person-card",
    expected: "card",
    fields: ["name", "phone"],
  },
  {
    name: "company-flyer",
    expected: "other",
    fields: ["company", "website", "address"],
  },
  { name: "unreadable-image", expected: "other", fields: [] },
];

function syntheticExtraction(fields: readonly CardFieldName[]): CardExtraction {
  const present = (field: CardFieldName) => fields.includes(field);
  const value = (field: CardFieldName) =>
    present(field) ? `synthetic-${field}` : null;
  const confidence = (field: CardFieldName) => (present(field) ? 0.9 : 0);

  return {
    address: value("address"),
    company: value("company"),
    department: value("department"),
    email: value("email"),
    field_confidence: {
      address: confidence("address"),
      company: confidence("company"),
      department: confidence("department"),
      email: confidence("email"),
      name: confidence("name"),
      phone: confidence("phone"),
      title: confidence("title"),
      website: confidence("website"),
    },
    language: "ja",
    name: value("name"),
    phone: value("phone"),
    title: value("title"),
    website: value("website"),
  };
}

describe.runIf(runShadow)("Jev card-likeness shadow evaluation", () => {
  it(
    "reports probabilities for synthetic card and non-card patterns",
    async () => {
      const evaluator = new JevDecisionEvaluator({
        apiKey: process.env.TYPESAFE_API_KEY,
        model: process.env.AI_DECISION_MODEL,
      });

      for (const fixture of cases) {
        const result = await evaluateCardLikenessInShadow(
          evaluator,
          syntheticExtraction(fixture.fields),
        );
        console.info(
          JSON.stringify({
            case: fixture.name,
            expected: fixture.expected,
            probability: result.probability,
          }),
        );
      }
    },
    cases.length * 6_000 + 10_000,
  );
});
