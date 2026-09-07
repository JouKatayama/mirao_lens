import { describe, expect, it } from "vitest";

import { nextScanPollDelay, scanPollBudgetMilliseconds } from "./scan-polling";

describe("nextScanPollDelay", () => {
  it("polls tightly while the pipeline is still likely to be running", () => {
    expect(nextScanPollDelay(0, "pending")).toBe(1_500);
    expect(nextScanPollDelay(29_999, "pending")).toBe(1_500);
  });

  it("widens the interval as the wait grows", () => {
    expect(nextScanPollDelay(30_000, "pending")).toBe(3_000);
    expect(nextScanPollDelay(90_000, "pending")).toBe(5_000);
  });

  it("backs off after a failed status request", () => {
    expect(nextScanPollDelay(0, "failed")).toBe(3_000);
  });

  it("stops once the budget is spent", () => {
    // The regression this locks: an unbounded loop against a stranded scan
    // showed a permanent spinner and never stopped consuming data.
    expect(nextScanPollDelay(scanPollBudgetMilliseconds, "pending")).toBeNull();
    expect(nextScanPollDelay(scanPollBudgetMilliseconds, "failed")).toBeNull();
    expect(
      nextScanPollDelay(scanPollBudgetMilliseconds + 60_000, "pending"),
    ).toBeNull();
  });
});
