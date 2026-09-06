import { describe, expect, it } from "vitest";

import { classifyProviderFailure } from "./provider-error";

describe("classifyProviderFailure", () => {
  it("treats a 429 as a rate limit", () => {
    expect(classifyProviderFailure({ status: 429 })).toBe("rate_limited");
  });

  it("treats an abort or a 408 as a timeout", () => {
    expect(classifyProviderFailure({ name: "AbortError" })).toBe("timeout");
    expect(classifyProviderFailure({ status: 408 })).toBe("timeout");
  });

  it("keeps rate limiting ahead of an abort raised on the same error", () => {
    expect(classifyProviderFailure({ name: "AbortError", status: 429 })).toBe(
      "rate_limited",
    );
  });

  it.each([400, 401, 403, 404, 409, 422])(
    "treats a rejected request (%i) as a configuration defect, not an outage",
    (status) => {
      // The regression this locks: every non-408/429 status used to fall
      // through to `provider_unavailable`, so a permanently malformed request
      // looked transient and was retried forever.
      expect(classifyProviderFailure({ status })).toBe("configuration");
    },
  );

  it.each([500, 502, 503, 504])(
    "keeps a server-side failure (%i) retryable",
    (status) => {
      expect(classifyProviderFailure({ status })).toBe("provider_unavailable");
    },
  );

  it("falls back to an outage for transport failures carrying no status", () => {
    expect(classifyProviderFailure(new Error("socket hang up"))).toBe(
      "provider_unavailable",
    );
    expect(classifyProviderFailure({})).toBe("provider_unavailable");
    expect(classifyProviderFailure(null)).toBe("provider_unavailable");
    expect(classifyProviderFailure(undefined)).toBe("provider_unavailable");
  });

  it("does not trust a non-numeric status", () => {
    expect(classifyProviderFailure({ status: "400" })).toBe(
      "provider_unavailable",
    );
  });
});
