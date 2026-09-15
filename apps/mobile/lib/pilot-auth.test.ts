import { describe, expect, it } from "vitest";

import { isGuestLoginEnabled } from "./pilot-auth";

describe("isGuestLoginEnabled", () => {
  it("enables guest entry only for the explicit public pilot flag", () => {
    expect(isGuestLoginEnabled("1")).toBe(true);
    expect(isGuestLoginEnabled(" 1 ")).toBe(true);
    expect(isGuestLoginEnabled(undefined)).toBe(false);
    expect(isGuestLoginEnabled("0")).toBe(false);
    expect(isGuestLoginEnabled("true")).toBe(false);
  });
});
