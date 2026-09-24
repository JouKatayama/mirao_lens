import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  RateLimitError,
  TypeSafeClient,
  TypeSafeError,
  type ChoiceCriteria as JevChoiceCriteria,
  type JsonValue as JevJsonValue,
  type Question as JevQuestion,
  type Questions as JevQuestions,
  type ScoreCriteria as JevScoreCriteria,
} from "@typesafe-ai/sdk";
import { z } from "zod";

import {
  DecisionEvaluatorError,
  decisionProbabilitySumTolerance,
  normalizeDecisionEvaluationRequest,
  normalizeDecisionEvaluationResult,
  toDecisionScoreProbabilityKey,
  type DecisionAnswer,
  type DecisionChoiceQuestion,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
  type DecisionQuestion,
  type DecisionScoreQuestion,
  type DecisionState,
} from "../decision-evaluator";

/**
 * The TypeSafe/Jev adapter for the typed decision layer.
 *
 * Jev is a System One model: it takes one state and a set of named, closed
 * questions, and answers all of them in a single pass with probability
 * distributions rather than prose. That is the same shape as
 * `DecisionEvaluator`, which is why this file is a translation and not an
 * abstraction — ADR-0005 defined the contract against exactly this class of
 * service before one was connected.
 *
 * Everything TypeSafe-specific stops here. No SDK type, model id, endpoint or
 * error class crosses back out: callers see `DecisionEvaluationResult` and
 * `DecisionEvaluatorError`, and `packages/domain` and `apps/mobile` never see
 * this module at all.
 *
 * Nothing in the request path calls it. It exists to be pointed at the shadow
 * evaluations, which measure and persist nothing.
 *
 * Where the two models disagree, this adapter converts rather than pretends,
 * and the conversions are documented at each site:
 *
 * - Jev scores an ordered rubric by position, from zero, and returns an
 *   expected score that falls between levels. The contract declares its own
 *   level values and expects one of them back.
 * - A Jev `noul` returns the probability of yes and nothing else — no verdict
 *   and no separate confidence.
 * - Jev wants a written description for every choice label and every score
 *   level. The contract can now carry them, and a question that omits them is
 *   sent with its labels undescribed.
 */

// ─── Provider limits ─────────────────────────────────────────────────────────
//
// These are Jev's, not ours, so they are checked before a request is sent
// rather than discovered as an HTTP 422. The contract is wider than Jev on
// both counts (50 options, 50 levels), so a question that is legal here can
// still be illegal there — which is a request defect, not an outage.

/** A Jev rubric holds between two and ten ordered levels. */
export const jevMinScoreLevels = 2;
export const jevMaxScoreLevels = 10;

/** A Jev choice question accepts up to 255 labels. */
export const jevMaxChoiceOptions = 255;

/**
 * Jev answers in 70–500ms, so this bound is loose enough never to cut off a
 * healthy call and tight enough that a hung one fails on our terms. It is
 * deliberately not part of `providerTimeoutMilliseconds`: those budgets are
 * shares of the card pipeline's 60-second route, and nothing here runs inside
 * it.
 */
export const jevDefaultTimeoutMilliseconds = 5_000;

/** The floating alias. Pin an exact version through configuration instead. */
export const jevDefaultModel = "jev-latest";

// ─── Options ─────────────────────────────────────────────────────────────────

/**
 * The transport seam, for the same reason `FlashBriefGenerator` has one: a
 * test can drive every branch of the translation without a network, a key, or
 * a mocked SDK.
 */
export type JevSystemOneRequest = (request: {
  model: string;
  questions: JevQuestions;
  state: DecisionState;
}) => Promise<unknown>;

export type JevDecisionEvaluatorOptions = Readonly<{
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  request?: JevSystemOneRequest;
  timeoutMilliseconds?: number;
}>;

// ─── Request translation ─────────────────────────────────────────────────────

function toJevChoiceCriteria(
  question: DecisionChoiceQuestion,
): JevChoiceCriteria {
  // `null` is Jev's own way of saying "this label describes itself", so a
  // question that declared no descriptions is sent undescribed rather than
  // given text this adapter invented. A caller whose labels are opaque has two
  // honest options: describe them here, or put what they refer to in the
  // state, which Jev reads in the same pass.
  return Object.fromEntries(
    question.options.map((option) => [
      option,
      question.optionDescriptions?.[option] ?? null,
    ]),
  );
}

function toJevScoreCriteria(question: DecisionScoreQuestion): JevScoreCriteria {
  const { levels } = question;

  if (levels.length < jevMinScoreLevels || levels.length > jevMaxScoreLevels) {
    throw new DecisionEvaluatorError("invalid_request");
  }

  // Jev reads `criteria` as the rubric: one description per level, in
  // ascending order. A described scale sends its own text, which is what makes
  // a score question worth asking a probabilistic evaluator at all. An
  // undescribed one falls back to the level value as a label — legal, and
  // about as informative as "score this 1 to 5" — so the fallback is a
  // compatibility path rather than a recommendation.
  const [first, second, ...rest] = levels.map((level) => {
    const key = toDecisionScoreProbabilityKey(level);

    return question.levelDescriptions?.[key] ?? key;
  });

  if (first === undefined || second === undefined) {
    throw new DecisionEvaluatorError("invalid_request");
  }

  return [first, second, ...rest];
}

export function toJevQuestion(question: DecisionQuestion): JevQuestion {
  if (question.type === "choice") {
    if (question.options.length > jevMaxChoiceOptions) {
      throw new DecisionEvaluatorError("invalid_request");
    }

    return {
      criteria: toJevChoiceCriteria(question),
      instructions: question.prompt,
      type: "choice",
    };
  }

  if (question.type === "score") {
    return {
      criteria: toJevScoreCriteria(question),
      instructions: question.prompt,
      type: "score",
    };
  }

  return { instructions: question.prompt, type: "noul" };
}

/**
 * Jev keys its questions and answers by name, the contract orders them in a
 * list and matches on `id`. Ids are unique by request validation, so the
 * record cannot silently lose one.
 */
export function toJevQuestions(
  request: DecisionEvaluationRequest,
): JevQuestions {
  const questions: Record<string, JevQuestion> = {};

  for (const question of request.questions) {
    questions[question.id] = toJevQuestion(question);
  }

  return questions;
}

// ─── Response translation ────────────────────────────────────────────────────
//
// The SDK types describe what Jev is documented to return, which is not the
// same as what arrived. These schemas are the boundary where the second
// becomes the first, so the fields are parsed rather than asserted.

const jevProbabilitiesSchema = z.record(z.string(), z.number());

/**
 * Jev emits probabilities rounded to hundredths. A complete five-outcome
 * distribution can therefore total 0.99 in a live response even though it
 * represents all outcomes. Keep the provider-neutral contract strict and
 * repair only this observed provider rounding at the adapter boundary.
 */
const jevProbabilitySumRoundingTolerance = 0.011;

function normalizeJevRoundedProbabilities(
  probabilities: Readonly<Record<string, number>>,
): Record<string, number> {
  const total = Object.values(probabilities).reduce(
    (sum, probability) => sum + probability,
    0,
  );

  if (Math.abs(total - 1) <= decisionProbabilitySumTolerance) {
    return { ...probabilities };
  }

  // Anything farther away is not the one-percent rounding observed from Jev.
  // Leave it unchanged so the canonical contract rejects it below.
  if (
    total <= 0 ||
    Math.abs(total - 1) > jevProbabilitySumRoundingTolerance
  ) {
    return { ...probabilities };
  }

  return Object.fromEntries(
    Object.entries(probabilities).map(([outcome, probability]) => [
      outcome,
      probability / total,
    ]),
  );
}

const jevNoulResponseSchema = z.object({
  noul: z.number(),
  type: z.literal("noul"),
});

const jevChoiceResponseSchema = z.object({
  choice: z.string(),
  confidence: z.number(),
  probabilities: jevProbabilitiesSchema,
  type: z.literal("choice"),
});

const jevScoreResponseSchema = z.object({
  confidence: z.number(),
  probabilities: jevProbabilitiesSchema,
  score: z.number(),
  type: z.literal("score"),
});

const jevSystemOneResultSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

/**
 * Jev keys score probabilities by rubric position counting from zero; the
 * contract keys them by the level value the caller declared. A five-level
 * rubric of 1–5 therefore comes back as "0".."4" and leaves as "1".."5".
 *
 * A position the response never mentioned is a distribution over a different
 * scale from the one asked about, so it fails here rather than being filled
 * with a zero that would let the sum check pass.
 */
function toDecisionScoreProbabilities(
  levels: readonly number[],
  probabilities: Readonly<Record<string, number>>,
): Record<string, number> {
  const mapped: Record<string, number> = {};

  for (const [position, level] of levels.entries()) {
    const mass = probabilities[String(position)];

    if (mass === undefined) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    mapped[toDecisionScoreProbabilityKey(level)] = mass;
  }

  return mapped;
}

/**
 * Jev's `score` is an expected value and may sit between levels — 1.43 on a
 * three-level rubric. The contract's `score` names one declared level, so what
 * is reported here is the level carrying the most mass, which is the same rule
 * Jev itself uses to pick a `choice`. Ties go to the lower level so that two
 * identical responses cannot produce two different answers.
 *
 * Nothing is lost: the distribution is translated in full, and
 * `expectedDecisionScore` recovers Jev's own number from it.
 */
function toModalLevel(
  levels: readonly number[],
  probabilities: Readonly<Record<string, number>>,
): number {
  let modal: number | undefined;
  let highest = -1;

  for (const level of levels) {
    const mass = probabilities[toDecisionScoreProbabilityKey(level)] ?? 0;

    if (mass > highest) {
      highest = mass;
      modal = level;
    }
  }

  if (modal === undefined) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  return modal;
}

export function toDecisionAnswer(
  question: DecisionQuestion,
  answer: unknown,
): DecisionAnswer {
  if (question.type === "choice") {
    const parsed = jevChoiceResponseSchema.safeParse(answer);

    if (!parsed.success) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    return {
      choice: parsed.data.choice,
      confidence: parsed.data.confidence,
      id: question.id,
      probabilities: normalizeJevRoundedProbabilities(
        parsed.data.probabilities,
      ),
      type: "choice",
    };
  }

  if (question.type === "score") {
    const parsed = jevScoreResponseSchema.safeParse(answer);

    if (!parsed.success) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    const probabilities = toDecisionScoreProbabilities(
      question.levels,
      normalizeJevRoundedProbabilities(parsed.data.probabilities),
    );

    return {
      confidence: parsed.data.confidence,
      id: question.id,
      probabilities,
      score: toModalLevel(question.levels, probabilities),
      type: "score",
    };
  }

  const parsed = jevNoulResponseSchema.safeParse(answer);

  if (!parsed.success) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  // `holds` and `confidence` are left off on purpose. Jev reports neither, and
  // deriving them would mean choosing a threshold in the layer furthest from
  // the consequences of getting it wrong. See ADR-0005.
  return {
    id: question.id,
    probability: parsed.data.noul,
    type: "boolean",
  };
}

/**
 * Turns a Jev response into answers for the questions we actually asked.
 *
 * An answer to a question that was never asked is not a harmless extra: it
 * means this adapter and Jev disagree about what was evaluated, and the
 * disagreement would otherwise be invisible in an aggregate computed over the
 * rest.
 */
export function toDecisionEvaluationResult(
  request: DecisionEvaluationRequest,
  output: unknown,
): DecisionEvaluationResult {
  const parsed = jevSystemOneResultSchema.safeParse(output);

  if (!parsed.success) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  const returned = new Map(Object.entries(parsed.data.answers));

  const answers = request.questions.map((question) => {
    const answer = returned.get(question.id);

    if (answer === undefined) {
      throw new DecisionEvaluatorError("invalid_output");
    }

    returned.delete(question.id);

    return toDecisionAnswer(question, answer);
  });

  if (returned.size > 0) {
    throw new DecisionEvaluatorError("invalid_output");
  }

  // Re-checked against the questions rather than trusted: the translation
  // above is ours, and a bug in it must fail like a bad provider response.
  return normalizeDecisionEvaluationResult(request, { answers });
}

// ─── Failures ────────────────────────────────────────────────────────────────

/**
 * `classifyProviderFailure` is not reused here. It is written against the
 * OpenAI SDK's error classes and its 4xx rule collapses everything into
 * `configuration`, which would hide the one distinction this contract adds:
 * `invalid_request` means the question we built was malformed — our defect,
 * unfixable by retrying and unrelated to credentials.
 *
 * No branch returns `quota_exhausted`. TypeSafe documents 401, 422, 429 and
 * 529 and no billing-specific signal, and guessing at one would repeat the
 * defect that shipped five times over in `provider-error.ts`: a spent balance
 * reported as a passing rate limit, retried forever, billed every time. Until
 * a real exhausted account is observed, a 429 from Jev is reported as a 429.
 */
export function toDecisionEvaluatorError(
  error: unknown,
): DecisionEvaluatorError {
  if (error instanceof DecisionEvaluatorError) {
    return error;
  }

  // Checked before `APIConnectionError`, which it extends.
  if (error instanceof APITimeoutError) {
    return new DecisionEvaluatorError("timeout");
  }

  if (error instanceof APIUserAbortError) {
    return new DecisionEvaluatorError("timeout");
  }

  // Checked before `APIError`, which it extends.
  if (error instanceof RateLimitError) {
    return new DecisionEvaluatorError("rate_limited");
  }

  if (error instanceof APIError) {
    const { status } = error;

    if (status === 408) {
      return new DecisionEvaluatorError("timeout");
    }

    // 400 and 422 are Jev rejecting the questions themselves.
    if (status === 400 || status === 422) {
      return new DecisionEvaluatorError("invalid_request");
    }

    // 401, 403, 404 and the rest of the 4xx range are a key, a permission or
    // a model alias that is wrong. Retrying cannot change any of them.
    if (status >= 400 && status < 500) {
      return new DecisionEvaluatorError("configuration");
    }

    // 5xx and 529 Overloaded stay retryable.
    return new DecisionEvaluatorError("provider_unavailable");
  }

  if (error instanceof APIConnectionError) {
    return new DecisionEvaluatorError("provider_unavailable");
  }

  // A missing key, an unusable runtime, or questions the SDK itself rejected.
  if (error instanceof TypeSafeError) {
    return new DecisionEvaluatorError("configuration");
  }

  return new DecisionEvaluatorError("provider_unavailable");
}

// ─── Client ──────────────────────────────────────────────────────────────────

/**
 * Exported so the posture below is assertable rather than a comment: a test
 * reads `logLevel` and `retry` off the constructed client.
 */
export function createJevClient(
  apiKey: string,
  baseUrl: string | undefined,
  timeoutMilliseconds: number,
): TypeSafeClient {
  return new TypeSafeClient({
    apiKey,
    ...(baseUrl === undefined ? {} : { baseURL: baseUrl }),
    // The SDK logs request headers at `debug` and response bodies with them.
    // The state sent here carries the user's Personal Context and the brief
    // written about a named individual, so logging is turned off at
    // construction rather than left to whatever `TYPESAFE_LOG_LEVEL` is set to
    // on the machine that happens to be running.
    logLevel: "off",
    // Retrying is the caller's, for the same reason the OpenAI stages set it:
    // SDK-internal retries are invisible from here and multiply latency
    // against a deadline someone else is holding.
    retry: { maxRetries: 0 },
    timeout: timeoutMilliseconds,
  });
}

function createJevRequest(
  apiKey: string,
  baseUrl: string | undefined,
  timeoutMilliseconds: number,
): JevSystemOneRequest {
  const client = createJevClient(apiKey, baseUrl, timeoutMilliseconds);

  return async ({ model, questions, state }) =>
    client.systemOne({
      model,
      questions,
      // `DecisionState` is deeply readonly and the SDK's equivalent is not.
      // The values are identical — both are validated JSON — so this is a
      // variance cast and nothing is copied or reinterpreted.
      state: state as Record<string, JevJsonValue>,
    });
}

export class JevDecisionEvaluator implements DecisionEvaluator {
  private readonly model: string;
  private readonly request: JevSystemOneRequest;

  constructor(options: JevDecisionEvaluatorOptions = {}) {
    this.model = options.model?.trim() || jevDefaultModel;

    if (options.request) {
      this.request = options.request;
      return;
    }

    // Read from the caller rather than from `process.env`, so that the one
    // place that knows how this deployment is configured stays
    // `apps/api/lib/server-config.ts`. An absent key is a configuration
    // defect, not a provider outage.
    const apiKey = options.apiKey?.trim();

    if (!apiKey) {
      throw new DecisionEvaluatorError("configuration");
    }

    this.request = createJevRequest(
      apiKey,
      options.baseUrl?.trim() || undefined,
      options.timeoutMilliseconds ?? jevDefaultTimeoutMilliseconds,
    );
  }

  async evaluate(
    request: DecisionEvaluationRequest,
  ): Promise<DecisionEvaluationResult> {
    // Validated before the call so that a malformed question costs nothing and
    // reports as ours rather than as an HTTP 422 from a provider.
    const normalized = normalizeDecisionEvaluationRequest(request);

    try {
      const output = await this.request({
        model: this.model,
        questions: toJevQuestions(normalized),
        state: normalized.state,
      });

      return toDecisionEvaluationResult(normalized, output);
    } catch (error) {
      throw toDecisionEvaluatorError(error);
    }
  }
}
