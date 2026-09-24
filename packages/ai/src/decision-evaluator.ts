import { z } from "zod";

/**
 * The typed decision boundary.
 *
 * Generation and judgement are different jobs and they fail differently. A
 * language model writes the candidates — sentences, keywords, next actions —
 * and is good at it; asked to *also* pick between them and report how sure it
 * is, it returns prose confidence, which is not a number anyone can threshold.
 * This module is the other half: a caller states a closed question over a
 * closed set of outcomes, and an evaluator answers with one of those outcomes,
 * a distribution over all of them, and a confidence.
 *
 * Nothing here names a provider, a model, an endpoint or an SDK. That is the
 * point: the canonical contract carries product meaning, and an adapter in
 * this package maps one vendor's response shape onto it, exactly as
 * `CardExtractor`, `FlashBriefGenerator` and `BriefJudge` already do. See
 * ADR-0005. Two implementations exist: the TypeSafe/Jev adapter in
 * `providers/jev-decision-evaluator.ts`, and the deterministic fake in
 * `decision-evaluator.fixture.ts`. Neither is reachable from a route.
 *
 * The three rules a caller can rely on:
 *
 * - an answer can only name an outcome the question declared,
 * - every declared outcome carries a probability, and they sum to one,
 * - probability and confidence are ordinary numbers in [0, 1].
 *
 * Deciding what to do with those numbers — thresholds, fallbacks, whether to
 * adopt the answer at all — is application code's job, not this module's.
 */

// ─── JSON-safe state ─────────────────────────────────────────────────────────
//
// State crosses a process boundary as JSON. Accepting a `Date`, an `undefined`
// or a `NaN` here would mean the value a caller believes it sent and the value
// an evaluator scores are different things, silently: JSON.stringify turns the
// first into a string, drops the second, and writes the third as `null`.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type DecisionState = Readonly<Record<string, JsonValue>>;

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((entry: unknown) => isJsonValue(entry));
  }

  return isJsonObject(value);
}

function isJsonObject(value: unknown): value is DecisionState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  // A class instance survives `JSON.stringify` as whatever its enumerable
  // fields happen to be, so plain-object-ness is checked rather than assumed.
  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  return Object.values(value).every((entry: unknown) => isJsonValue(entry));
}

export const decisionStateSchema = z.custom<DecisionState>(isJsonObject, {
  message: "Decision state must be a JSON-safe object.",
});

// ─── Limits ──────────────────────────────────────────────────────────────────

export const decisionQuestionIdMaxLength = 100;
export const decisionPromptMaxLength = 2000;
export const decisionOutcomeLabelMaxLength = 200;
export const decisionOutcomeDescriptionMaxLength = 500;
export const decisionMaxQuestions = 50;
export const decisionMaxChoiceOptions = 50;
export const decisionMaxScoreLevels = 50;

/**
 * A provider that rounds its distribution to two decimals is not returning a
 * broken one, so the sum is checked loosely enough to survive rounding and
 * tightly enough to catch a distribution that covers the wrong outcome set.
 */
export const decisionProbabilitySumTolerance = 1e-3;

// ─── Questions ───────────────────────────────────────────────────────────────

const questionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(decisionQuestionIdMaxLength);
const promptSchema = z.string().trim().min(1).max(decisionPromptMaxLength);
const outcomeLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(decisionOutcomeLabelMaxLength);

const outcomeDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(decisionOutcomeDescriptionMaxLength);

/** Probability and confidence share one scale: the unit interval. */
const unitIntervalSchema = z.number().min(0).max(1);

export const decisionChoiceQuestionSchema = z
  .object({
    id: questionIdSchema,
    /**
     * What each option means, keyed by the option label.
     *
     * Optional, and for the same reason as `levelDescriptions`: a label that
     * says what it is ("billing", "technical") needs no gloss, while a label
     * that stands for something else ("high_confidence", "candidate_1") is
     * meaningless on its own. Supplied, it must describe every declared
     * option.
     */
    optionDescriptions: z
      .record(z.string(), outcomeDescriptionSchema)
      .optional(),
    options: z.array(outcomeLabelSchema).min(1).max(decisionMaxChoiceOptions),
    prompt: promptSchema,
    type: z.literal("choice"),
  })
  .strict();

export const decisionScoreQuestionSchema = z
  .object({
    id: questionIdSchema,
    /**
     * What each level means, keyed by level via
     * `toDecisionScoreProbabilityKey` — the same keying the answer's
     * distribution uses, so a rubric and the mass over it are read the same
     * way round.
     *
     * Optional, because a scale whose meaning is fully carried by the prompt
     * is a legitimate question. Supplied, it must describe every declared
     * level: a rubric with holes asks an evaluator to guess what the gaps
     * mean, and the guess is invisible in the number that comes back.
     *
     * This exists because a bare ordered set of numbers is not a rubric. An
     * evaluator told only "score 1 to 5" and an evaluator told what a 4 is
     * are not answering the same question, and the second is the one the
     * product's own prompts already describe in prose.
     */
    levelDescriptions: z
      .record(z.string(), outcomeDescriptionSchema)
      .optional(),
    // A one-level scale cannot express a judgement, so two is the floor.
    levels: z.array(z.number().finite()).min(2).max(decisionMaxScoreLevels),
    prompt: promptSchema,
    type: z.literal("score"),
  })
  .strict();

export const decisionBooleanQuestionSchema = z
  .object({
    id: questionIdSchema,
    prompt: promptSchema,
    type: z.literal("boolean"),
  })
  .strict();

export const decisionQuestionSchema = z.discriminatedUnion("type", [
  decisionChoiceQuestionSchema,
  decisionScoreQuestionSchema,
  decisionBooleanQuestionSchema,
]);

function isStrictlyAscending(values: readonly number[]): boolean {
  return values.every(
    (value, index) => index === 0 || value > (values[index - 1] ?? value),
  );
}

/**
 * Exactly the declared outcomes, no more and no fewer. A description keyed to
 * an outcome the question does not have is a rubric written against a
 * different question, which is the same defect as a distribution over the
 * wrong outcome set — and outcomes are distinct by the checks above, so
 * matching the count and finding every one matches the key sets exactly.
 */
function describesEveryOutcome(
  outcomes: readonly string[],
  descriptions: Readonly<Record<string, string>>,
): boolean {
  return (
    Object.keys(descriptions).length === outcomes.length &&
    outcomes.every((outcome) => descriptions[outcome] !== undefined)
  );
}

/**
 * The cross-question rules live here rather than on each question schema
 * because `z.discriminatedUnion` accepts plain object schemas only: a
 * `superRefine` on a member would make it a `ZodEffects` and the union would
 * stop discriminating.
 */
export const decisionEvaluationRequestSchema = z
  .object({
    questions: z.array(decisionQuestionSchema).min(1).max(decisionMaxQuestions),
    state: decisionStateSchema,
  })
  .strict()
  .superRefine((request, ctx) => {
    const seenIds = new Set<string>();

    for (const [index, question] of request.questions.entries()) {
      // Answers are matched to questions by id. Two questions sharing one id
      // means an answer cannot be attributed to either.
      if (seenIds.has(question.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate question id: ${question.id}.`,
          path: ["questions", index, "id"],
        });
      }

      seenIds.add(question.id);

      if (
        question.type === "choice" &&
        new Set(question.options).size !== question.options.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Choice options must be distinct.",
          path: ["questions", index, "options"],
        });
      }

      if (
        question.type === "choice" &&
        question.optionDescriptions !== undefined &&
        !describesEveryOutcome(question.options, question.optionDescriptions)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Choice option descriptions must cover every option.",
          path: ["questions", index, "optionDescriptions"],
        });
      }

      // An ordered scale is what makes a distribution over levels readable.
      if (question.type === "score" && !isStrictlyAscending(question.levels)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Score levels must ascend strictly.",
          path: ["questions", index, "levels"],
        });
      }

      if (
        question.type === "score" &&
        question.levelDescriptions !== undefined &&
        !describesEveryOutcome(
          question.levels.map(toDecisionScoreProbabilityKey),
          question.levelDescriptions,
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Score level descriptions must cover every declared level.",
          path: ["questions", index, "levelDescriptions"],
        });
      }
    }
  });

export type DecisionChoiceQuestion = z.infer<
  typeof decisionChoiceQuestionSchema
>;
export type DecisionScoreQuestion = z.infer<typeof decisionScoreQuestionSchema>;
export type DecisionBooleanQuestion = z.infer<
  typeof decisionBooleanQuestionSchema
>;
export type DecisionQuestion = z.infer<typeof decisionQuestionSchema>;
export type DecisionEvaluationRequest = z.infer<
  typeof decisionEvaluationRequestSchema
>;

// ─── Answers ─────────────────────────────────────────────────────────────────
//
// These describe an external response, so every field is validated rather than
// trusted, and `.strict()` rejects anything the contract does not name.

export const decisionChoiceAnswerSchema = z
  .object({
    choice: outcomeLabelSchema,
    confidence: unitIntervalSchema,
    id: questionIdSchema,
    probabilities: z.record(z.string(), unitIntervalSchema),
    type: z.literal("choice"),
  })
  .strict();

export const decisionScoreAnswerSchema = z
  .object({
    confidence: unitIntervalSchema,
    id: questionIdSchema,
    /** Keyed by level, via `toDecisionScoreProbabilityKey`. */
    probabilities: z.record(z.string(), unitIntervalSchema),
    score: z.number().finite(),
    type: z.literal("score"),
  })
  .strict();

/**
 * The probability is the answer; the verdict and the confidence are not.
 *
 * `probability` is required because it is the whole content of a boolean
 * judgement: an evaluator that cannot say how likely the proposition is has
 * not answered. `holds` and `confidence` are optional because a calibrated
 * evaluator may legitimately decline to supply either.
 *
 * Turning a probability into a verdict means choosing a threshold, and
 * ADR-0005 put that choice in application code, where the cost of being wrong
 * in each direction is known. An adapter that synthesised `holds` from some
 * default cut-off would be making that product decision invisibly, in the one
 * layer that has no idea what the answer is for. Separately, a spread-derived
 * `confidence` is not meaningful for a two-outcome question: a probability of
 * 0.02 already reports both the answer and the certainty.
 */
export const decisionBooleanAnswerSchema = z
  .object({
    confidence: unitIntervalSchema.optional(),
    /** The verdict, when the evaluator commits to one. */
    holds: z.boolean().optional(),
    id: questionIdSchema,
    /** The probability that the proposition holds. */
    probability: unitIntervalSchema,
    type: z.literal("boolean"),
  })
  .strict();

export const decisionAnswerSchema = z.discriminatedUnion("type", [
  decisionChoiceAnswerSchema,
  decisionScoreAnswerSchema,
  decisionBooleanAnswerSchema,
]);

export const decisionEvaluationResponseSchema = z
  .object({
    answers: z.array(decisionAnswerSchema).min(1).max(decisionMaxQuestions),
  })
  .strict();

export type DecisionChoiceAnswer = z.infer<typeof decisionChoiceAnswerSchema>;
export type DecisionScoreAnswer = z.infer<typeof decisionScoreAnswerSchema>;
export type DecisionBooleanAnswer = z.infer<typeof decisionBooleanAnswerSchema>;
export type DecisionAnswer = z.infer<typeof decisionAnswerSchema>;

export type DecisionEvaluationResult = Readonly<{
  /** One answer per question, in the order the questions were asked. */
  answers: readonly DecisionAnswer[];
}>;

// ─── Errors ──────────────────────────────────────────────────────────────────

export type DecisionEvaluatorErrorCode =
  | "configuration"
  | "invalid_request"
  | "invalid_output"
  | "quota_exhausted"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

/**
 * The transport codes match the other AI stages so a future adapter can reuse
 * `classifyProviderFailure`. `invalid_request` is the one addition: this
 * contract validates what the caller asks as well as what comes back, and a
 * malformed question is our defect rather than the provider's.
 */
export class DecisionEvaluatorError extends Error {
  constructor(readonly code: DecisionEvaluatorErrorCode) {
    super(`Decision evaluation failed: ${code}.`);
    this.name = "DecisionEvaluatorError";
  }
}

export interface DecisionEvaluator {
  evaluate(
    request: DecisionEvaluationRequest,
  ): Promise<DecisionEvaluationResult>;
}

// ─── Normalization ───────────────────────────────────────────────────────────

/** Score probabilities are keyed by their level rendered as a string. */
export function toDecisionScoreProbabilityKey(level: number): string {
  return String(level);
}

/**
 * The probability-weighted mean of an ordered scale.
 *
 * `score` names the single level the evaluator settled on, which is the answer
 * to "which level is this". It is not the answer to "how good is this on
 * average", and for a scorer that spreads its mass the two differ: a
 * distribution of 0.45 / 0.10 / 0.45 over levels 1, 3 and 5 has a modal level
 * of 1 and an expected score of 3.
 *
 * Both readings are recoverable because the full distribution is part of the
 * contract, and this is the second one. It is a pure function over an answer
 * the caller already holds rather than a field on the answer, so no adapter
 * has to decide which reading a caller wanted.
 *
 * The answer must belong to the question: a mean taken over a distribution
 * that covers different levels is a number with no meaning attached.
 */
export function expectedDecisionScore(
  question: DecisionScoreQuestion,
  answer: DecisionScoreAnswer,
): number {
  if (question.id !== answer.id) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  assertDistribution(
    question.levels.map(toDecisionScoreProbabilityKey),
    answer.probabilities,
  );

  return question.levels.reduce((total, level) => {
    const mass = answer.probabilities[toDecisionScoreProbabilityKey(level)];

    return total + level * (mass ?? 0);
  }, 0);
}

export function normalizeDecisionEvaluationRequest(
  request: DecisionEvaluationRequest,
): DecisionEvaluationRequest {
  const result = decisionEvaluationRequestSchema.safeParse(request);

  if (!result.success) {
    throw new DecisionEvaluatorError("invalid_request");
  }

  return result.data;
}

function assertDistribution(
  outcomes: readonly string[],
  probabilities: Readonly<Record<string, number>>,
): void {
  // Outcomes are distinct by request validation, so matching the count and
  // finding every outcome is the same as matching the key sets exactly.
  if (Object.keys(probabilities).length !== outcomes.length) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  let total = 0;

  for (const outcome of outcomes) {
    const probability = probabilities[outcome];

    if (probability === undefined) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    total += probability;
  }

  if (Math.abs(total - 1) > decisionProbabilitySumTolerance) {
    throw new DecisionEvaluatorError("invalid_output");
  }
}

function checkAnswerAgainstQuestion(
  question: DecisionQuestion,
  answer: DecisionAnswer,
): void {
  if (question.type === "choice" && answer.type === "choice") {
    assertDistribution(question.options, answer.probabilities);

    if (!question.options.includes(answer.choice)) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    return;
  }

  if (question.type === "score" && answer.type === "score") {
    assertDistribution(
      question.levels.map(toDecisionScoreProbabilityKey),
      answer.probabilities,
    );

    if (!question.levels.includes(answer.score)) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    return;
  }

  // A boolean answer carries no outcome set of its own: the schema has already
  // bounded both of its numbers.
  if (question.type === "boolean" && answer.type === "boolean") {
    return;
  }

  throw new DecisionEvaluatorError("invalid_output");
}

/**
 * Turns whatever an evaluator returned into answers a caller can read against
 * the questions it asked, or refuses.
 *
 * There is no partial result. A missing answer, an extra one, a value outside
 * the declared outcomes, or a distribution over the wrong set all mean the two
 * sides disagree about what was evaluated — and an aggregate computed over a
 * disagreement looks exactly like a real number.
 */
export function normalizeDecisionEvaluationResult(
  request: DecisionEvaluationRequest,
  output: unknown,
): DecisionEvaluationResult {
  const questions = normalizeDecisionEvaluationRequest(request).questions;
  const parsed = decisionEvaluationResponseSchema.safeParse(output);

  if (!parsed.success) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  const pending = new Map<string, DecisionAnswer>();

  for (const answer of parsed.data.answers) {
    if (pending.has(answer.id)) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    pending.set(answer.id, answer);
  }

  const answers = questions.map((question) => {
    const answer = pending.get(question.id);

    if (!answer) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    pending.delete(question.id);
    checkAnswerAgainstQuestion(question, answer);

    return answer;
  });

  if (pending.size > 0) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  return { answers };
}
