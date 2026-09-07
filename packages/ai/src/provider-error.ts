/**
 * Shared classification of provider transport failures.
 *
 * Every AI stage declares the same error-code vocabulary and, before this
 * module existed, carried its own byte-identical copy of this mapping. The
 * duplication is what let one defect ship five times over: any status other
 * than 429 and 408 fell through to `provider_unavailable`, so a request the
 * provider had *rejected* was reported as a provider that was *down*.
 *
 * That distinction is load-bearing rather than cosmetic. `configuration` is the
 * only code the card-intelligence stage treats as terminal (see
 * `classifyFailure` in apps/api/lib/card-intelligence.ts), so a permanently
 * malformed request classified as `provider_unavailable` is retried forever,
 * bills for every attempt, and can never succeed.
 */
export type ProviderFailureCode =
  | "configuration"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

type ProviderErrorShape = Readonly<{ name?: unknown; status?: unknown }>;

function httpStatusOf(error: unknown): number | null {
  const status = (error as ProviderErrorShape | null)?.status;

  return typeof status === "number" ? status : null;
}

export function classifyProviderFailure(error: unknown): ProviderFailureCode {
  const status = httpStatusOf(error);

  if (status === 429) {
    return "rate_limited";
  }

  if ((error as ProviderErrorShape | null)?.name === "AbortError") {
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
