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
 * When the wait for a scan began on this device, and which scan it belongs to.
 *
 * The pilot is judged on how long the user waits for a Flash Brief (P50 ≤ 5s,
 * P90 ≤ 10s), and the per-stage `ai_runs.latency_ms` the server records covers
 * only the model calls. This is the other half: the wait as the user
 * experiences it, measured from the moment the capture was accepted.
 *
 * Kept per scan on purpose. Opening a finished scan from history is not a
 * wait, and reporting one would put an invented number into the one figure the
 * latency hypothesis is checked against.
 */
export type ScanWaitClock = Readonly<{ scanId: string; startedAt: number }>;

/**
 * Milliseconds waited so far, or null when this client did not watch the whole
 * wait — a different scan, or one opened after the fact.
 */
export function elapsedSinceCapture(
  wait: ScanWaitClock | null,
  scanId: string,
  now: number,
): number | null {
  if (!wait || wait.scanId !== scanId) {
    return null;
  }

  const elapsed = now - wait.startedAt;

  // A clock that runs backwards (a device time change mid-scan) measures
  // nothing; reporting the negative number would be worse than reporting none.
  return elapsed >= 0 ? elapsed : null;
}

/**
 * Scan-funnel milestones are transitions, not states. Emitting them from the
 * observed status alone would count a completed scan again every time the user
 * reopens it from history, so a milestone only fires when this client actually
 * watched the field appear: same scan, previously absent, now present.
 *
 * That is also what makes the wait measurable: a milestone this client watched
 * arrive is one whose wait it timed.
 */
export function scanMilestoneEvents(
  previous: ScanMilestoneSnapshot | null,
  next: ScanMilestoneSnapshot,
  wait: ScanWaitClock | null,
  now: number,
): AnalyticsEvent[] {
  if (!previous || previous.scanId !== next.scanId) {
    return [];
  }

  const names: AnalyticsEventName[] = [];
  if (!previous.hasCard && next.hasCard) {
    names.push("card_extraction_success");
  }
  if (!previous.hasBrief && next.hasBrief) {
    names.push("brief_ready");
  }

  const elapsedMs = elapsedSinceCapture(wait, next.scanId, now);

  return names.map((name) => waitEvent(name, elapsedMs));
}

/**
 * An event carries `elapsed_ms` only when the wait was actually observed. An
 * absent property reads as "not measured here"; a null would have to be
 * filtered back out of every latency query.
 */
export function waitEvent(
  name: AnalyticsEventName,
  elapsedMs: number | null,
): AnalyticsEvent {
  return elapsedMs === null
    ? { name }
    : { name, properties: { elapsed_ms: elapsedMs } };
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
