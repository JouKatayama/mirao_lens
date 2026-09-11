import type { AnalyticsEvent } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  activationStorageKey,
  createActivationTracker,
  isRecentSignup,
  recentSignupWindowMilliseconds,
  scanMilestoneEvents,
  toScanMilestoneSnapshot,
  type ActivationStorage,
} from "./funnel-events";

const scanId = "11111111-1111-4111-8111-111111111111";

function snapshot(hasCard: boolean, hasBrief: boolean) {
  return { hasBrief, hasCard, scanId };
}

describe("scanMilestoneEvents", () => {
  it("emits extraction success when the card first appears", () => {
    expect(
      scanMilestoneEvents(snapshot(false, false), snapshot(true, false)),
    ).toEqual(["card_extraction_success"]);
  });

  it("emits both milestones when a single poll reveals card and brief", () => {
    expect(
      scanMilestoneEvents(snapshot(false, false), snapshot(true, true)),
    ).toEqual(["card_extraction_success", "brief_ready"]);
  });

  it("does not repeat a milestone that was already observed", () => {
    expect(
      scanMilestoneEvents(snapshot(true, true), snapshot(true, true)),
    ).toEqual([]);
  });

  it("emits nothing without a previous observation, so reopened history is not recounted", () => {
    expect(scanMilestoneEvents(null, snapshot(true, true))).toEqual([]);
  });

  it("emits nothing when the previous observation belongs to another scan", () => {
    const other = { hasBrief: false, hasCard: false, scanId: "other" };
    expect(scanMilestoneEvents(other, snapshot(true, true))).toEqual([]);
  });

  it("derives a snapshot from a status response", () => {
    expect(
      toScanMilestoneSnapshot({
        card: { name: "デモ" },
        flash_brief: null,
        scan_id: scanId,
      }),
    ).toEqual({ hasBrief: false, hasCard: true, scanId });
  });
});

describe("isRecentSignup", () => {
  const now = Date.parse("2026-09-11T00:00:00.000Z");

  it("accepts an account created inside the window", () => {
    expect(isRecentSignup("2026-09-10T23:00:00.000Z", now)).toBe(true);
  });

  it("rejects an existing account signing in on a new device", () => {
    expect(isRecentSignup("2026-06-01T00:00:00.000Z", now)).toBe(false);
  });

  it("treats a clock skewed into the future as a new account", () => {
    expect(isRecentSignup("2026-09-11T00:05:00.000Z", now)).toBe(true);
  });

  it("rejects a missing or unparsable timestamp", () => {
    expect(isRecentSignup(undefined, now)).toBe(false);
    expect(isRecentSignup("not-a-date", now)).toBe(false);
  });

  it("rejects an account created exactly outside the window", () => {
    expect(
      isRecentSignup(
        new Date(now - recentSignupWindowMilliseconds - 1).toISOString(),
        now,
      ),
    ).toBe(false);
  });
});

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    storage: {
      async getItem(key: string) {
        return values.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        values.set(key, value);
      },
    } satisfies ActivationStorage,
    values,
  };
}

describe("createActivationTracker", () => {
  it("tracks an activation event once and persists the marker", async () => {
    const events: AnalyticsEvent[] = [];
    const { storage, values } = createStorage();
    const tracker = createActivationTracker({
      storage,
      track: (event) => events.push(event),
    });

    await tracker.trackOnce("user-1", "first_scan_started");
    await tracker.trackOnce("user-1", "first_scan_started");

    expect(events).toEqual([{ name: "first_scan_started" }]);
    expect(
      values.has(activationStorageKey("user-1", "first_scan_started")),
    ).toBe(true);
  });

  it("keeps the marker per user", async () => {
    const events: AnalyticsEvent[] = [];
    const { storage } = createStorage();
    const tracker = createActivationTracker({
      storage,
      track: (event) => events.push(event),
    });

    await tracker.trackOnce("user-1", "first_brief_viewed");
    await tracker.trackOnce("user-2", "first_brief_viewed");

    expect(events).toHaveLength(2);
  });

  it("skips an event whose marker already exists", async () => {
    const events: AnalyticsEvent[] = [];
    const { storage } = createStorage({
      [activationStorageKey("user-1", "first_scan_started")]: "2026-09-01",
    });
    const tracker = createActivationTracker({
      storage,
      track: (event) => events.push(event),
    });

    await tracker.trackOnce("user-1", "first_scan_started");

    expect(events).toEqual([]);
  });

  it("still tracks when the marker cannot be read", async () => {
    const events: AnalyticsEvent[] = [];
    const tracker = createActivationTracker({
      storage: {
        async getItem() {
          throw new Error("storage unavailable");
        },
        async setItem() {
          throw new Error("storage unavailable");
        },
      },
      track: (event) => events.push(event),
    });

    await tracker.trackOnce("user-1", "first_scan_started");

    expect(events).toEqual([{ name: "first_scan_started" }]);
  });

  it("tracks a signup only for a newly created account", async () => {
    const events: AnalyticsEvent[] = [];
    const { storage } = createStorage();
    const now = Date.parse("2026-09-11T00:00:00.000Z");
    const tracker = createActivationTracker({
      now: () => now,
      storage,
      track: (event) => events.push(event),
    });

    await tracker.trackSignup({
      created_at: "2026-01-01T00:00:00.000Z",
      id: "returning",
    });
    await tracker.trackSignup({
      created_at: "2026-09-10T23:59:00.000Z",
      id: "new",
    });

    expect(events).toEqual([{ name: "signup_completed" }]);
  });
});
