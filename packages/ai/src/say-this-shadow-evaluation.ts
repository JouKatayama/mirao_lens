import type { FlashBriefInput } from "@miraio/domain";

import {
  DecisionEvaluatorError,
  normalizeDecisionEvaluationResult,
  type DecisionBooleanQuestion,
  type DecisionChoiceQuestion,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
  type DecisionState,
} from "./decision-evaluator";
import {
  maxShadowPersonalContextItemLength,
  maxShadowPersonalContextItems,
} from "./flash-brief-shadow-evaluation";

/**
 * Scores which SAY THIS question the user should actually open with.
 *
 * This is the first thing pointed at a real decision evaluator, and it is
 * deliberately the smallest judgement in the product. A model has already
 * written one to three candidate questions; the only thing asked here is which
 * of them to ask, with `abstain` available when none of them is worth asking.
 * Identity, FACT/HYPOTHESIS, POTENTIAL, Mutual Value and Next Action are all
 * left where they are — ADR-0005 treats each connection as its own decision,
 * and nothing has been measured yet.
 *
 * It is a shadow evaluation in the strict sense: the return value goes back to
 * whoever called and nowhere else. Nothing here writes to the database, nothing
 * reaches a route, and no threshold turns a probability into a verdict. The
 * Fast Path cannot acquire latency from this module because no code on the
 * Fast Path imports it, and — like `brief-judge.ts` and its sibling shadow
 * evaluation — it is absent from `index.ts`.
 *
 * The probabilities it returns are about a *sentence*, never about a person.
 * `answerable` says a question is easy to answer; it does not say the two
 * people are compatible, and nothing in it may be shown to a user as a
 * likelihood that something is true.
 */

// ─── Shape ───────────────────────────────────────────────────────────────────

/** The label chosen when no candidate is worth asking. */
export const sayThisAbstainOption = "abstain";

/** `say_this` holds at most three candidates; see `flashBriefPublicSchema`. */
export const maxSayThisCandidates = 3;

/** As in the domain schema, so a candidate is never reshaped on its way here. */
export const maxSayThisCandidateLength = 400;

export const sayThisSelectionQuestionId = "say_this_selection";

/**
 * What a good opening question is, as five propositions rather than one score.
 *
 * Each is phrased so that true is good and false is the failure, which keeps
 * a returned probability readable without a key: 0.9 always means better.
 * They are propositions rather than a 1–5 scale on purpose — see the score
 * translation in `providers/jev-decision-evaluator.ts` for why a scale is the
 * weakest thing this contract can currently ask a probabilistic evaluator.
 */
export const sayThisShadowDimensions = [
  "answerable",
  "context_relevance",
  "advances_conversation",
  "grounded",
  "natural_tone",
] as const;

export type SayThisShadowDimension = (typeof sayThisShadowDimensions)[number];

export const sayThisShadowDimensionPrompts: Readonly<
  Record<SayThisShadowDimension, string>
> = {
  advances_conversation: `Answering this question gives the user something to
build the next question on. A question that can be closed with one word, or
whose answer leaves nowhere obvious to go, does not.`,

  answerable: `The person receiving this question can answer it on the spot,
from what they do day to day. A question needing preparation, internal figures,
or a decision this person does not own is not answerable.`,

  context_relevance: `The question connects to something in the user's own
Personal Context — their expertise, what they offer, or what they are seeking.
A question any stranger could equally have asked does not.`,

  grounded: `The question asserts nothing that the card data and the Personal
Context do not support. A question whose premise is a guess about this person's
priorities, seniority, or company strategy fails, however plausible the guess
sounds.`,

  natural_tone: `This reads as a natural business question between two people
who have just met — not as a pitch, a qualification script, or a compliment
written to open a sale.`,
};

export const sayThisSelectionPrompt = `Which of these opening questions should
the user ask first? The candidates are in the state under "candidates" and are
named by their "id".

Choose "${sayThisAbstainOption}" when none of them is worth asking: when every
candidate rests on an assumption the card data and Personal Context do not
support, when they all read as a sales script rather than a conversation, or
when the card is too sparse for any of them to land.`;

export type SayThisShadowEvaluationRequest = Readonly<{
  /** The SAY THIS candidates, in the order the generator produced them. */
  candidates: readonly string[];
  input: FlashBriefInput;
}>;

export type SayThisShadowCandidate = Readonly<{
  /** Probability for each proposition, keyed by dimension. */
  dimensions: Readonly<Record<SayThisShadowDimension, number>>;
  id: string;
  /** Position in the `candidates` array the caller supplied. */
  index: number;
  selectionProbability: number;
}>;

export type SayThisShadowEvaluation = Readonly<{
  abstainProbability: number;
  candidates: readonly SayThisShadowCandidate[];
  /** A candidate id, or `abstain`. Reported, never acted on. */
  selected: string;
  selectionConfidence: number;
}>;

export function toSayThisCandidateId(index: number): string {
  return `candidate_${index + 1}`;
}

export function toSayThisDimensionQuestionId(
  candidateId: string,
  dimension: SayThisShadowDimension,
): string {
  return `${candidateId}.${dimension}`;
}

// ─── Data minimization ───────────────────────────────────────────────────────
//
// Built from an allow-list, like the Flash Brief shadow evaluation, so a field
// added to the card contract later cannot leak here by default.
//
// This one is tighter than its sibling: the person's name is left out too.
// Judging whether a question is answerable needs the role that would answer
// it, not the individual who holds it, and the evaluation reads exactly as
// well without it. Also excluded: email, phone, website, the card image, the
// raw OCR text, the generated brief prose, and the unabridged Personal
// Context.

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();

  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

export function buildSayThisShadowEvaluationState(
  request: SayThisShadowEvaluationRequest,
): DecisionState {
  const { candidates, input } = request;

  return {
    candidates: candidates.map((text, index) => ({
      id: toSayThisCandidateId(index),
      text: truncate(text, maxSayThisCandidateLength),
    })),
    card: {
      company: input.card.company,
      department: input.card.department,
      title: input.card.title,
    },
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

export function buildSayThisShadowEvaluationQuestions(
  candidateCount: number,
): readonly (DecisionBooleanQuestion | DecisionChoiceQuestion)[] {
  const candidateIds = Array.from(
    { length: candidateCount },
    (_unused, index) => toSayThisCandidateId(index),
  );

  const selection: DecisionChoiceQuestion = {
    id: sayThisSelectionQuestionId,
    options: [...candidateIds, sayThisAbstainOption],
    prompt: sayThisSelectionPrompt,
    type: "choice",
  };

  // One proposition per candidate rather than one per rubric. A single
  // "answerable" probability spread across three different questions would
  // describe none of them, and per-candidate numbers are what a human scorer
  // can later be compared against.
  const dimensions: DecisionBooleanQuestion[] = candidateIds.flatMap(
    (candidateId) =>
      sayThisShadowDimensions.map((dimension) => ({
        id: toSayThisDimensionQuestionId(candidateId, dimension),
        prompt: `${sayThisShadowDimensionPrompts[dimension]}\n\nThis is about the candidate whose id is "${candidateId}".`,
        type: "boolean" as const,
      })),
  );

  return [selection, ...dimensions];
}

export function buildSayThisShadowEvaluationRequest(
  request: SayThisShadowEvaluationRequest,
): DecisionEvaluationRequest {
  const { candidates } = request;

  if (candidates.length === 0 || candidates.length > maxSayThisCandidates) {
    throw new DecisionEvaluatorError("invalid_request");
  }

  if (candidates.some((candidate) => candidate.trim().length === 0)) {
    throw new DecisionEvaluatorError("invalid_request");
  }

  return {
    questions: [...buildSayThisShadowEvaluationQuestions(candidates.length)],
    state: buildSayThisShadowEvaluationState(request),
  };
}

// ─── Result ──────────────────────────────────────────────────────────────────

/**
 * A selection scored over a different candidate set than the one asked about
 * is not a partial measurement: the numbers below would still look like
 * numbers, and nothing downstream could tell them apart from real ones.
 */
export function toSayThisShadowEvaluation(
  candidateCount: number,
  result: DecisionEvaluationResult,
): SayThisShadowEvaluation {
  const answers = new Map(result.answers.map((answer) => [answer.id, answer]));
  const selection = answers.get(sayThisSelectionQuestionId);

  if (selection?.type !== "choice") {
    throw new DecisionEvaluatorError("invalid_output");
  }

  const candidates = Array.from(
    { length: candidateCount },
    (_unused, index): SayThisShadowCandidate => {
      const id = toSayThisCandidateId(index);
      const selectionProbability = selection.probabilities[id];

      if (selectionProbability === undefined) {
        throw new DecisionEvaluatorError("invalid_output");
      }

      const dimensions = Object.fromEntries(
        sayThisShadowDimensions.map((dimension) => {
          const answer = answers.get(
            toSayThisDimensionQuestionId(id, dimension),
          );

          if (answer?.type !== "boolean") {
            throw new DecisionEvaluatorError("invalid_output");
          }

          return [dimension, answer.probability];
        }),
      ) as Record<SayThisShadowDimension, number>;

      return { dimensions, id, index, selectionProbability };
    },
  );

  const abstainProbability = selection.probabilities[sayThisAbstainOption];

  if (abstainProbability === undefined) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  return {
    abstainProbability,
    candidates,
    selected: selection.choice,
    selectionConfidence: selection.confidence,
  };
}

/**
 * Asks an evaluator which opening question to use.
 *
 * The result is returned to the caller and nowhere else: it is not persisted,
 * not attached to the scan, not exposed by any API, and not used to change the
 * brief that was already generated. A caller that wants the Flash Brief to
 * survive a Jev outage gets that by discarding the rejection — this function
 * has no side effect to undo.
 */
export async function evaluateSayThisInShadow(
  evaluator: DecisionEvaluator,
  request: SayThisShadowEvaluationRequest,
): Promise<SayThisShadowEvaluation> {
  const evaluationRequest = buildSayThisShadowEvaluationRequest(request);
  const result = await evaluator.evaluate(evaluationRequest);

  // The evaluator is an interface, so its answers are re-checked against the
  // questions we actually asked rather than taken on trust.
  return toSayThisShadowEvaluation(
    request.candidates.length,
    normalizeDecisionEvaluationResult(evaluationRequest, result),
  );
}
