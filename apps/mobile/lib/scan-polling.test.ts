import { describe, expect, it } from "vitest";

import {
  nextScanPollDelay,
  scanPollBudgetMilliseconds,
  stalledScanResumeDelayMilliseconds,
  watchForStall,
} from "./scan-polling";

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

describe("watchForStall", () => {
  const key = "scan-1:0:card_ready";

  it("starts watching when a between-stages status first appears", () => {
    expect(watchForStall(null, key, 1_000)).toEqual({
      next: { key, resumed: false, since: 1_000 },
      resume: false,
    });
  });

  it("does not resume a status that is still within the normal hand-off", () => {
    const watching = watchForStall(null, key, 0).next;

    expect(
      watchForStall(watching, key, stalledScanResumeDelayMilliseconds - 1)
        .resume,
    ).toBe(false);
  });

  it("resumes once the status has held past the delay", () => {
    const watching = watchForStall(null, key, 0).next;
    const stalled = watchForStall(
      watching,
      key,
      stalledScanResumeDelayMilliseconds,
    );

    expect(stalled.resume).toBe(true);
    expect(stalled.next).toMatchObject({ resumed: true });
  });

  it("resumes at most once for the same stall", () => {
    const watching = watchForStall(null, key, 0).next;
    const stalled = watchForStall(
      watching,
      key,
      stalledScanResumeDelayMilliseconds,
    ).next;

    expect(
      watchForStall(stalled, key, stalledScanResumeDelayMilliseconds * 4)
        .resume,
    ).toBe(false);
  });

  it("starts over when the status, scan or poll epoch changes", () => {
    const stalled = watchForStall(
      watchForStall(null, key, 0).next,
      key,
      stalledScanResumeDelayMilliseconds,
    ).next;

    expect(watchForStall(stalled, "scan-1:1:card_ready", 60_000).next).toEqual({
      key: "scan-1:1:card_ready",
      resumed: false,
      since: 60_000,
    });
  });

  it("stops watching once the scan leaves the between-stages statuses", () => {
    const watching = watchForStall(null, key, 0).next;

    expect(watchForStall(watching, null, 5_000)).toEqual({
      next: null,
      resume: false,
    });
  });
});
