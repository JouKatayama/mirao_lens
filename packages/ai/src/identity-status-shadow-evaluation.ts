import type { FlashBriefInput, FlashBriefPublic } from "@miraio/domain";

import {
  DecisionEvaluatorError,
  normalizeDecisionEvaluationResult,
  type DecisionChoiceQuestion,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
  type DecisionState,
} from "./decision-evaluator";
import {
  identityStatusDefinition,
  identityStatusOptionDescriptions,
  identityStatusPromptOrder,
  type IdentityStatusLabel,
} from "./identity-status-rubric";

/**
 * Assesses Identity Status a second time, against the same four definitions
 * the generator was given.
 *
 * ADR-0005 singles this one out: "identity resolution is explicitly a
 * confidence question". Today the answer is a bare label, and the difference
 * between a comfortable `medium_confidence` and one that nearly came out
 * `unresolved` is lost — which matters, because US-006 turns that label into
 * whether a person-specific biography may be shown as fact. A distribution
 * over the four labels is the thing that difference actually lives in.
 *
 * Shadow only: nothing persisted, no route, no threshold, absent from
 * `index.ts`. The brief keeps the status it was generated with.
 *
 * Two scoping decisions, both to keep the numbers comparable across scans:
 *
 * - the generator's own `identity_status` is not in the state, for the same
 *   reason the POTENTIAL evaluation hides its score — an evaluator shown the
 *   answer reproduces it, and the agreement measures nothing,
 * - `prior_identity_status` is not in the state either. That is the floor rule
 *   from a previous scan, and applying it here would measure the floor instead
 *   of what this card supports. What this evaluates is the card-data-only
 *   assessment, which is what the four definitions describe.
 */

export type IdentityStatusShadowEvaluationRequest = Readonly<{
  brief: FlashBriefPublic;
  input: FlashBriefInput;
}>;

export type IdentityStatusShadowEvaluation = Readonly<{
  confidence: number;
  /** What the Flash Brief decided, carried through untouched. */
  generatorStatus: string;
  /** The label carrying the most mass. Reported, never acted on. */
  modalStatus: string;
  probabilities: Readonly<Record<IdentityStatusLabel, number>>;
  /**
   * Mass on a label the card data can never establish. The prompt tells the
   * generator not to use `verified`; anything meaningfully above zero here is
   * a finding about the question, not about this card.
   */
  verifiedProbability: number;
}>;

export const identityStatusQuestionId = "identity_status";

export const identityStatusShadowQuestion: DecisionChoiceQuestion = {
  id: identityStatusQuestionId,
  optionDescriptions: identityStatusOptionDescriptions,
  options: [...identityStatusPromptOrder],
  prompt: identityStatusDefinition,
  type: "choice",
};

// ─── Data minimization ───────────────────────────────────────────────────────
//
// The four definitions turn on which card fields are present and whether the
// email domain matches the company, so unlike the sibling evaluations this one
// genuinely needs the name and the email domain. It gets the *shape* of those
// fields rather than the fields: whether a name is present and whether it is a
// full name, and the email's domain without the local part. The Personal
// Context is not here at all — it says nothing about who this person is.

/**
 * Said in words rather than as a token.
 *
 * The first version of this returned `"full_name"`, and a live run read it as
 * `unresolved` at 0.87 on a card whose name and company were both present —
 * the case the rubric defines as `medium_confidence`. A bare identifier is not
 * self-describing: the rubric talks about whether a full name is present, so
 * that is what the state says. This is the shadow evaluation finding a defect
 * in the shadow evaluation, which is the cheapest kind.
 */
function describeName(name: string | null): string {
  const trimmed = name?.trim() ?? "";

  if (trimmed.length === 0) {
    return "no name is present on the card";
  }

  // One run of characters or more than one — the "only a single name" case in
  // the `unresolved` definition, counted the way a reader would count it for
  // both CJK and space-separated names.
  return trimmed.split(/\s+/u).length > 1
    ? "a full name is present on the card"
    : "only a single name token is present on the card";
}

/** The domain only. The local part identifies the person and is not needed. */
function emailDomainOf(email: string | null): string | null {
  const trimmed = email?.trim() ?? "";
  const at = trimmed.lastIndexOf("@");

  if (at <= 0) {
    return null;
  }

  return trimmed.slice(at + 1).toLowerCase() || null;
}

/**
 * The host only. `high_confidence` turns on the email domain matching the
 * company's, and the card's website is the only place the company's own domain
 * appears — so the host goes, and the path, query and scheme do not.
 */
function websiteHostOf(website: string | null): string | null {
  const raw = website?.trim();

  if (!raw) {
    return null;
  }

  // A card may carry "example.com" as readily as "https://example.com".
  for (const candidate of [raw, `https://${raw}`]) {
    try {
      return new URL(candidate).hostname.toLowerCase() || null;
    } catch {
      continue;
    }
  }

  return null;
}

export function buildIdentityStatusShadowEvaluationState(
  request: IdentityStatusShadowEvaluationRequest,
): DecisionState {
  const { input } = request;

  return {
    card: {
      company: input.card.company,
      department: input.card.department,
      email_domain: emailDomainOf(input.card.email ?? null),
      name: describeName(input.card.name),
      title: input.card.title,
      website_host: websiteHostOf(input.card.website ?? null),
    },
    locale: input.locale,
  };
}

export function buildIdentityStatusShadowEvaluationRequest(
  request: IdentityStatusShadowEvaluationRequest,
): DecisionEvaluationRequest {
  return {
    questions: [identityStatusShadowQuestion],
    state: buildIdentityStatusShadowEvaluationState(request),
  };
}

export function toIdentityStatusShadowEvaluation(
  generatorStatus: string,
  result: DecisionEvaluationResult,
): IdentityStatusShadowEvaluation {
  const [answer] = result.answers;

  if (result.answers.length !== 1 || answer?.type !== "choice") {
    throw new DecisionEvaluatorError("invalid_output");
  }

  const probabilities = Object.fromEntries(
    identityStatusPromptOrder.map((label) => {
      const mass = answer.probabilities[label];

      if (mass === undefined) {
        throw new DecisionEvaluatorError("invalid_output");
      }

      return [label, mass];
    }),
  ) as Record<IdentityStatusLabel, number>;

  return {
    confidence: answer.confidence,
    generatorStatus,
    modalStatus: answer.choice,
    probabilities,
    verifiedProbability: probabilities.verified,
  };
}

/**
 * Asks an evaluator to assess Identity Status. The result is returned to the
 * caller and nowhere else: whatever comes back, the brief keeps its own status
 * and no biography becomes showable because of a number produced here.
 */
export async function evaluateIdentityStatusInShadow(
  evaluator: DecisionEvaluator,
  request: IdentityStatusShadowEvaluationRequest,
): Promise<IdentityStatusShadowEvaluation> {
  const evaluationRequest = buildIdentityStatusShadowEvaluationRequest(request);
  const result = await evaluator.evaluate(evaluationRequest);

  return toIdentityStatusShadowEvaluation(
    request.brief.identity_status,
    normalizeDecisionEvaluationResult(evaluationRequest, result),
  );
}
