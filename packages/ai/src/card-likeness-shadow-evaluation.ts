import { cardFieldNames, type CardExtraction } from "@miraio/domain";

import {
  DecisionEvaluatorError,
  normalizeDecisionEvaluationResult,
  type DecisionEvaluationRequest,
  type DecisionEvaluator,
} from "./decision-evaluator";

/**
 * Jev receives structured text, not image pixels. This experiment asks only
 * whether the extracted field pattern resembles a personal business card.
 * It cannot prove that the photographed object is a card.
 */
export function buildCardLikenessShadowRequest(
  extraction: CardExtraction,
): DecisionEvaluationRequest {
  return {
    questions: [
      {
        id: "is_business_card",
        prompt:
          "Do these extracted field-presence and transcription-confidence signals resemble a person's business card? Answer yes only when the pattern is consistent with a personal business card; an advertisement, company flyer, receipt, or event badge is not one. Missing fields alone do not make a card invalid.",
        type: "boolean",
      },
    ],
    state: {
      fields: Object.fromEntries(
        cardFieldNames.map((field) => [
          field,
          {
            present: extraction[field] !== null,
            confidence: extraction.field_confidence[field],
          },
        ]),
      ),
    },
  };
}

export async function evaluateCardLikenessInShadow(
  evaluator: DecisionEvaluator,
  extraction: CardExtraction,
): Promise<Readonly<{ probability: number }>> {
  const request = buildCardLikenessShadowRequest(extraction);
  const result = normalizeDecisionEvaluationResult(
    request,
    await evaluator.evaluate(request),
  );
  const [answer] = result.answers;

  if (result.answers.length !== 1 || answer?.type !== "boolean") {
    throw new DecisionEvaluatorError("invalid_output");
  }

  return { probability: answer.probability };
}
