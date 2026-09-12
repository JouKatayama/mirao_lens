import { describe, expect, it } from "vitest";

import { readReminderScanId, toReminderTarget } from "./reminder-target";

const scanId = "11111111-1111-4111-8111-111111111111";

describe("readReminderScanId", () => {
  it("reads the scan a reminder was scheduled for", () => {
    expect(readReminderScanId(toReminderTarget(scanId))).toBe(scanId);
  });

  it("routes nowhere for a payload without a scan", () => {
    // Payloads come back from the OS: an older build, or a notification this
    // app did not schedule, must not open an arbitrary screen.
    expect(readReminderScanId(undefined)).toBeNull();
    expect(readReminderScanId(null)).toBeNull();
    expect(readReminderScanId({})).toBeNull();
    expect(readReminderScanId({ scanId: 42 })).toBeNull();
    expect(readReminderScanId({ scanId: "" })).toBeNull();
    expect(readReminderScanId({ scanId: "   " })).toBeNull();
    expect(readReminderScanId("scanId")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(readReminderScanId({ scanId: ` ${scanId} ` })).toBe(scanId);
  });
});
