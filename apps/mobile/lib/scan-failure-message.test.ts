import { describe, expect, it } from "vitest";

import { scanFailureGuidance } from "./scan-failure-message";

describe("scanFailureGuidance", () => {
  it("offers the same image again for a transient failure", () => {
    const guidance = scanFailureGuidance({
      errorCode: "rate_limited",
      hasLocalCapture: true,
      status: "failed_retryable",
    });

    expect(guidance.canRetrySameImage).toBe(true);
    expect(guidance.canRecapture).toBe(true);
    expect(guidance.message).toContain("同じ画像で再試行");
  });

  it("asks for a new photograph when the card could not be read", () => {
    const guidance = scanFailureGuidance({
      errorCode: "invalid_output",
      hasLocalCapture: true,
      status: "failed_terminal",
    });

    expect(guidance.canRetrySameImage).toBe(false);
    expect(guidance.canRecapture).toBe(true);
    expect(guidance.title).toContain("撮り直して");
  });

  it("withholds the same-image retry for a scan opened from history", () => {
    // The capture lives on the device that took it, so the button could only
    // ever fail.
    const guidance = scanFailureGuidance({
      errorCode: "rate_limited",
      hasLocalCapture: false,
      status: "failed_retryable",
    });

    expect(guidance.canRetrySameImage).toBe(false);
    expect(guidance.canRecapture).toBe(true);
  });

  it("offers neither retry when the provider balance is spent", () => {
    // Both buttons are dead ends here: the photograph was never the problem,
    // and the account is not something this user can top up.
    const guidance = scanFailureGuidance({
      errorCode: "quota_exhausted",
      hasLocalCapture: true,
      status: "failed_terminal",
    });

    expect(guidance.canRetrySameImage).toBe(false);
    expect(guidance.canRecapture).toBe(false);
    expect(guidance.message).toContain("運営担当者");
    expect(guidance.message).not.toContain("再試行できます");
  });

  it("keeps the spent balance distinct even when the scan stayed retryable", () => {
    // Older rows were written before the classification changed, so the status
    // alone cannot be trusted to carry this.
    const guidance = scanFailureGuidance({
      errorCode: "quota_exhausted",
      hasLocalCapture: true,
      status: "failed_retryable",
    });

    expect(guidance.canRetrySameImage).toBe(false);
    expect(guidance.canRecapture).toBe(false);
  });

  it("falls back to a new photograph when no code was recorded", () => {
    const guidance = scanFailureGuidance({
      errorCode: null,
      hasLocalCapture: false,
      status: "failed_terminal",
    });

    expect(guidance.canRecapture).toBe(true);
    expect(guidance.message).toContain("新しく撮影");
  });
});
