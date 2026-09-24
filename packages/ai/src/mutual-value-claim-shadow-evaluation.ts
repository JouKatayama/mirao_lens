import type { MutualValueInput, MutualValuePublic } from "@miraio/domain";

import {
  DecisionEvaluatorError,
  normalizeDecisionEvaluationResult,
  type DecisionBooleanQuestion,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
  type DecisionState,
} from "./decision-evaluator";
import {
  maxShadowPersonalContextItemLength,
  maxShadowPersonalContextItems,
} from "./flash-brief-shadow-evaluation";
import {
  mutualValueFactProposition,
  type MutualValueClaimType,
} from "./mutual-value-claim-rubric";

/**
 * Re-checks every GIVE and GET claim against the same fact/hypothesis
 * definition the generator was given.
 *
 * This is the rule AGENTS.md states outright — "Fact, hypothesis, and
 * uncertainty must remain distinguishable" — and today the only thing
 * enforcing it is the same model that wrote the sentence, labelling its own
 * work in the same response. A label is also the coarsest possible answer: a
 * claim that is 55% grounded and one that is 99% grounded both come back
 * `fact`, and nothing downstream can tell them apart.
 *
 * So each item gets a probability instead. Shadow only: nothing persisted, no
 * route, no threshold, absent from `index.ts`. The stored Mutual Value keeps
 * the `claim_type` it was generated with.
 *
 * As in the sibling evaluations, the generator's own labels are kept out of
 * the state. An evaluator shown them agrees with them.
 */

export const mutualValueClaimSections = ["give", "get"] as const;

export type MutualValueClaimSection = (typeof mutualValueClaimSections)[number];

/** As in the domain schema, so an item is never reshaped on its way here. */
export const maxMutualValueItemLength = 1000;

/** `give` and `get` hold at most five items each; see `mutualValueSchema`. */
export const maxMutualValueItemsPerSection = 5;

export type MutualValueClaimShadowEvaluationRequest = Readonly<{
  input: MutualValueInput;
  mutualValue: MutualValuePublic;
}>;

export type MutualValueClaimShadowItem = Readonly<{
  /**
   * Probability that the claim is a fact by the generator's own definition.
   * Not a verdict: turning it into one means choosing a cut-off, and that
   * belongs to whoever bears the cost of mislabelling a guess as a fact.
   */
  factProbability: number;
  /** What the generator labelled it, carried through untouched. */
  generatorClaimType: MutualValueClaimType;
  id: string;
  index: number;
  section: MutualValueClaimSection;
}>;

export type MutualValueClaimShadowEvaluation = Readonly<{
  items: readonly MutualValueClaimShadowItem[];
}>;

export function toMutualValueClaimId(
  section: MutualValueClaimSection,
  index: number,
): string {
  return `${section}_${index + 1}`;
}

// ─── Data minimization ───────────────────────────────────────────────────────
//
// An allow-list, as in the sibling shadow evaluations. Excluded: the person's
// name, email, phone, website, the card image, the raw OCR text, the
// unabridged Personal Context — and every `claim_type`, for the reason above.

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();

  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

function claimsOf(
  request: MutualValueClaimShadowEvaluationRequest,
  section: MutualValueClaimSection,
): readonly {
  readonly claim_type: MutualValueClaimType;
  readonly text: string;
}[] {
  return request.mutualValue[section];
}

export function buildMutualValueClaimShadowEvaluationState(
  request: MutualValueClaimShadowEvaluationRequest,
): DecisionState {
  const { input } = request;

  return {
    card: {
      company: input.card.company,
      department: input.card.department,
      title: input.card.title,
    },
    claims: mutualValueClaimSections.flatMap((section) =>
      claimsOf(request, section).map((item, index) => ({
        id: toMutualValueClaimId(section, index),
        section,
        text: truncate(item.text, maxMutualValueItemLength),
      })),
    ),
    locale: input.locale,
    meeting_goal: input.meeting_goal,
    personal_context: {
      current_company: input.personal_context.current_company,
      current_role: input.personal_context.current_role,
      items: input.personal_context.items
        .slice(0, maxShadowPersonalContextItems)
        .map((item) =>
          truncate(
            `[${item.type}] ${item.text}`,
            maxShadowPersonalContextItemLength,
          ),
        ),
    },
  };
}

// ─── Questions ───────────────────────────────────────────────────────────────

export function buildMutualValueClaimShadowEvaluationQuestions(
  request: MutualValueClaimShadowEvaluationRequest,
): readonly DecisionBooleanQuestion[] {
  return mutualValueClaimSections.flatMap((section) =>
    claimsOf(request, section).map((_unused, index) => {
      const id = toMutualValueClaimId(section, index);

      return {
        id,
        prompt: `${mutualValueFactProposition}\n\nThis is about the claim whose id is "${id}", in the state under "claims".`,
        type: "boolean" as const,
      };
    }),
  );
}

export function buildMutualValueClaimShadowEvaluationRequest(
  request: MutualValueClaimShadowEvaluationRequest,
): DecisionEvaluationRequest {
  for (const section of mutualValueClaimSections) {
    const count = claimsOf(request, section).length;

    if (count === 0 || count > maxMutualValueItemsPerSection) {
      throw new DecisionEvaluatorError("invalid_request");
    }
  }

  return {
    questions: [...buildMutualValueClaimShadowEvaluationQuestions(request)],
    state: buildMutualValueClaimShadowEvaluationState(request),
  };
}

// ─── Result ──────────────────────────────────────────────────────────────────

export function toMutualValueClaimShadowEvaluation(
  request: MutualValueClaimShadowEvaluationRequest,
  result: DecisionEvaluationResult,
): MutualValueClaimShadowEvaluation {
  const answers = new Map(result.answers.map((answer) => [answer.id, answer]));

  const items = mutualValueClaimSections.flatMap((section) =>
    claimsOf(request, section).map(
      (item, index): MutualValueClaimShadowItem => {
        const id = toMutualValueClaimId(section, index);
        const answer = answers.get(id);

        if (answer?.type !== "boolean") {
          throw new DecisionEvaluatorError("invalid_output");
        }

        return {
          factProbability: answer.probability,
          generatorClaimType: item.claim_type,
          id,
          index,
          section,
        };
      },
    ),
  );

  return { items };
}

/**
 * Asks an evaluator how grounded each claim is. The result is returned to the
 * caller and nowhere else: no item is relabelled, nothing is rewritten, and no
 * hypothesis becomes a fact because of a number produced here.
 */
export async function evaluateMutualValueClaimsInShadow(
  evaluator: DecisionEvaluator,
  request: MutualValueClaimShadowEvaluationRequest,
): Promise<MutualValueClaimShadowEvaluation> {
  const evaluationRequest =
    buildMutualValueClaimShadowEvaluationRequest(request);
  const result = await evaluator.evaluate(evaluationRequest);

  return toMutualValueClaimShadowEvaluation(
    request,
    normalizeDecisionEvaluationResult(evaluationRequest, result),
  );
}
