import { describe, expect, it } from "vitest";

import { identityStatuses, isIdentityStatus } from "./index";

describe("IdentityStatus", () => {
  it("contains every status locked by the product specification", () => {
    expect(identityStatuses).toEqual([
      "verified",
      "high_confidence",
      "medium_confidence",
      "unresolved",
    ]);
  });

  it("rejects values outside the canonical contract", () => {
    expect(isIdentityStatus("verified")).toBe(true);
    expect(isIdentityStatus("unknown")).toBe(false);
  });
});
