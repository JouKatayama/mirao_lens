import type { AnalyticsEvent, AnalyticsEventName } from "@miraio/domain";

// ─── Per-scan funnel milestones ──────────────────────────────────────────────

export type ScanMilestoneSnapshot = Readonly<{
  scanId: string;
  hasCard: boolean;
  hasBrief: boolean;
}>;

export function toScanMilestoneSnapshot(status: {
  scan_id: string;
  card: unknown;
  flash_brief: unknown;
}): ScanMilestoneSnapshot {
  return {
    hasBrief: status.flash_brief !== null,
    hasCard: status.card !== null,
    scanId: status.scan_id,
  };
}

/**
 * Scan-funnel milestones are transitions, not states. Emitting them from the
 * observed status alone would count a completed scan again every time the user
 * reopens it from history, so a milestone only fires when this client actually
 * watched the field appear: same scan, previously absent, now present.
 */
export function scanMilestoneEvents(
  previous: ScanMilestoneSnapshot | null,
  next: ScanMilestoneSnapshot,
): AnalyticsEventName[] {
  if (!previous || previous.scanId !== next.scanId) {
    return [];
  }

  const events: AnalyticsEventName[] = [];
  if (!previous.hasCard && next.hasCard) {
    events.push("card_extraction_success");
  }
  if (!previous.hasBrief && next.hasBrief) {
    events.push("brief_ready");
  }
  return events;
}

// ─── Once-per-user activation events ─────────────────────────────────────────

export type ActivationEventName = Extract<
  AnalyticsEventName,
  "signup_completed" | "first_scan_started" | "first_brief_viewed"
>;

export type ActivationStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}>;

export type ActivationTracker = Readonly<{
  trackOnce(userId: string, event: ActivationEventName): Promise<void>;
  trackSignup(user: { id: string; created_at?: string }): Promise<void>;
}>;

export const activationStorageKeyPrefix = "miraio.activation";
export const recentSignupWindowMilliseconds = 24 * 60 * 60 * 1000;

export function activationStorageKey(
  userId: string,
  event: ActivationEventName,
): string {
  return `${activationStorageKeyPrefix}.${userId}.${event}`;
}

/**
 * `signup_completed` has no dedicated client signal: email OTP sign-up and
 * sign-in are the same flow. The first session this install sees for a user is
 * only a sign-up if the account itself is new, so the marker is combined with
 * the account age. An existing user on a new device is therefore not counted.
 */
export function isRecentSignup(
  createdAt: string | undefined,
  now: number,
): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created <= recentSignupWindowMilliseconds;
}

export function createActivationTracker(
  dependencies: Readonly<{
    storage: ActivationStorage;
    track(event: AnalyticsEvent): void;
    now?: () => number;
  }>,
): ActivationTracker {
  const now = dependencies.now ?? (() => Date.now());

  async function trackOnce(
    userId: string,
    event: ActivationEventName,
  ): Promise<void> {
    const key = activationStorageKey(userId, event);

    let alreadySent = false;
    try {
      alreadySent = (await dependencies.storage.getItem(key)) !== null;
    } catch {
      // An unreadable marker cannot prove the event was already sent. Sending
      // it again is the safer failure: activation is analysed per user, so a
      // duplicate is absorbed while a missing event is lost for good.
      alreadySent = false;
    }

    if (alreadySent) return;

    dependencies.track({ name: event });

    try {
      await dependencies.storage.setItem(key, new Date(now()).toISOString());
    } catch {
      // Analytics failures are non-fatal.
    }
  }

  return {
    trackOnce,
    async trackSignup(user) {
      if (!isRecentSignup(user.created_at, now())) return;
      await trackOnce(user.id, "signup_completed");
    },
  };
}
