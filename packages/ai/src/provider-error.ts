/**
 * Shared classification of provider transport failures.
 *
 * Every AI stage declares the same error-code vocabulary and, before this
 * module existed, carried its own byte-identical copy of this mapping. The
 * duplication is what let one defect ship five times over: any status other
 * than 429 and 408 fell through to `provider_unavailable`, so a request the
 * provider had *rejected* was reported as a provider that was *down*.
 *
 * That distinction is load-bearing rather than cosmetic. Only `configuration`
 * and `quota_exhausted` are treated as terminal (see `classifyFailure` in
 * apps/api/lib/card-intelligence.ts), so a permanently failing request
 * classified as anything else is retried forever, bills for every attempt, and
 * can never succeed.
 */
import { APIConnectionTimeoutError, APIUserAbortError } from "openai";

export type ProviderFailureCode =
  | "configuration"
  | "quota_exhausted"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

type ProviderErrorShape = Readonly<{
  code?: unknown;
  name?: unknown;
  status?: unknown;
  type?: unknown;
}>;

function httpStatusOf(error: unknown): number | null {
  const status = (error as ProviderErrorShape | null)?.status;

  return typeof status === "number" ? status : null;
}

/**
 * A spent balance and a rate limit arrive as the same HTTP 429, and only the
 * body tells them apart. Conflating them sends the user guidance that can never
 * come true — "wait a minute and try again" — while the scan stays retryable
 * and the operator sees nothing but rate limiting in the logs. Waiting does not
 * refill an account.
 *
 * OpenAI reports it as `type: "insufficient_quota"` with a `code` that has
 * changed over time (`insufficient_quota`, then `credit_balance_exhausted`), so
 * both fields are matched and neither is trusted alone.
 */
function isQuotaFailure(error: unknown): boolean {
  const shape = error as ProviderErrorShape | null;

  return (
    shape?.type === "insufficient_quota" ||
    shape?.code === "insufficient_quota" ||
    shape?.code === "credit_balance_exhausted"
  );
}

/**
 * The OpenAI SDK signals its own client-side deadline with
 * `APIConnectionTimeoutError`, and a caller-supplied `AbortSignal` with
 * `APIUserAbortError`. Neither sets `name` (it stays "Error") and neither
 * carries an HTTP status, so without this check both fell through to
 * `provider_unavailable` — reporting the provider as down when it was our own
 * budget that expired. The `AbortError` name below still covers a bare
 * `AbortController` abort that never reached the SDK.
 */
function isDeadlineFailure(error: unknown): boolean {
  return (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIUserAbortError
  );
}

export function classifyProviderFailure(error: unknown): ProviderFailureCode {
  const status = httpStatusOf(error);

  // Checked before the 429 branch below, which would otherwise swallow it.
  if (isQuotaFailure(error)) {
    return "quota_exhausted";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if ((error as ProviderErrorShape | null)?.name === "AbortError") {
    return "timeout";
  }

  if (isDeadlineFailure(error)) {
    return "timeout";
  }

  if (status === 408) {
    return "timeout";
  }

  // Anything else in the 4xx range is a defect in the request we sent — an
  // invalid schema, an unknown model alias, a rejected credential. Retrying
  // cannot change the outcome, so these are surfaced as `configuration` rather
  // than as a transient outage. 5xx and unrecognized transport failures stay
  // retryable.
  if (status !== null && status >= 400 && status < 500) {
    return "configuration";
  }

  return "provider_unavailable";
}
