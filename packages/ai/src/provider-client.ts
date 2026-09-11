import OpenAI from "openai";

/**
 * Shared construction of the OpenAI client used by every AI stage.
 *
 * The card pipeline runs as one `after()` callback whose lifetime is bounded by
 * the route's `maxDuration` (60s on `POST /v1/scans`). The SDK defaults — a
 * 10-minute timeout and two silent internal retries — can outlast that budget
 * many times over, so a slow provider call was killed by the platform *mid
 * flight*: no failure row was written, the scan stayed in an intermediate
 * status, and nothing ever retried it. Bounding each call instead makes the
 * stage fail on its own terms, which records a sanitized failure the client can
 * surface and retry.
 *
 * `maxRetries: 0` is deliberate. Retrying belongs to the claim/retry semantics
 * in the database functions, which are visible and idempotent; SDK-internal
 * retries are invisible here and multiply latency against a hard deadline.
 */

/**
 * Per-stage budgets in milliseconds. The four card-pipeline stages run in
 * sequence inside one 60s route budget, so their sum must stay under it with
 * room for the database round trips between them.
 */
export const providerTimeoutMilliseconds = {
  /** Vision request with the largest payload; the slowest stage in practice. */
  cardExtraction: 20_000,
  companyContext: 10_000,
  /**
   * Company web research reads pages before answering, so it cannot fit the
   * plain companyContext budget. It runs outside the brief's critical path:
   * the brief is already generated when the evidence sweep uses it.
   */
  companyWebResearch: 25_000,
  flashBrief: 14_000,
  mutualValue: 14_000,
  /** Runs alone on the onboarding route rather than in the card pipeline. */
  personalContext: 20_000,
} as const;

/**
 * Reasoning depth, per stage.
 *
 * The GPT-5.6 family reasons by default, which the timeouts above were not
 * sized for: they were measured against a non-reasoning model. Effort acts as
 * a ceiling rather than a floor, so a low setting still lets the model skip
 * reasoning entirely on an easy prompt — the fast path can ask for speed
 * without forbidding thought.
 *
 * `minimal` is deliberately absent. The SDK still types it, but the GPT-5.6
 * models reject it with HTTP 400, which would surface here as a provider
 * outage and retry forever against a configuration mistake.
 */
export const reasoningEffortValues = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof reasoningEffortValues)[number];

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (reasoningEffortValues as readonly string[]).includes(value);
}

/**
 * Absent effort omits the parameter entirely rather than sending a default.
 * A model that does not reason — or a self-hosted server that does not know
 * the field — must keep working, and only the caller knows which it is.
 */
export function toReasoningParameter(effort: ReasoningEffort | undefined): {
  reasoning?: { effort: ReasoningEffort };
} {
  return effort ? { reasoning: { effort } } : {};
}

/**
 * `baseUrl` points the SDK at an OpenAI-compatible server instead of OpenAI.
 * vLLM implements `/v1/responses`, and Ollama has since v0.13.3, so the
 * structured-output calls in this package can run against a locally served
 * model without rewriting them for Chat Completions. Whether a given server
 * honors the strict JSON-schema format these stages send has to be verified
 * against that server; a mismatch surfaces as `invalid_output`, which the
 * stages already treat as terminal rather than retrying.
 *
 * Omit it and the client talks to OpenAI exactly as before.
 */
export function createOpenAIClient(
  apiKey: string,
  timeoutMilliseconds: number,
  baseUrl?: string,
): OpenAI {
  return new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: timeoutMilliseconds,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });
}
