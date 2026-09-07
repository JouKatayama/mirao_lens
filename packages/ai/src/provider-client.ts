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
  flashBrief: 14_000,
  mutualValue: 14_000,
  /** Runs alone on the onboarding route rather than in the card pipeline. */
  personalContext: 20_000,
} as const;

export function createOpenAIClient(
  apiKey: string,
  timeoutMilliseconds: number,
): OpenAI {
  return new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: timeoutMilliseconds,
  });
}
