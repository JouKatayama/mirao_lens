/**
 * How long the client keeps polling one scan before handing control back to
 * the user.
 *
 * The server pipeline runs inside a single route invocation, so a scan can be
 * stranded in an intermediate status with nothing scheduled to advance it. The
 * client used to poll such a scan every 1.5s forever: a permanent spinner, and
 * a steady drain on battery and mobile data with no way out. Stopping at a
 * budget turns that into an explicit "still working — check again" the user can
 * act on, and every scan screen already exposes a refresh action.
 */
export const scanPollBudgetMilliseconds = 3 * 60 * 1000;

export type ScanPollOutcome = "pending" | "failed";

/**
 * Delay in milliseconds before the next status poll, or `null` once the budget
 * is spent and polling should stop.
 *
 * The interval widens as the wait grows: the first stages usually finish in
 * seconds, so a tight interval there keeps the happy path responsive, while a
 * long wait is almost always a stalled pipeline that no amount of polling will
 * unstick.
 */
export function nextScanPollDelay(
  elapsedMilliseconds: number,
  outcome: ScanPollOutcome,
): number | null {
  if (elapsedMilliseconds >= scanPollBudgetMilliseconds) {
    return null;
  }

  if (outcome === "failed") {
    return 3_000;
  }

  if (elapsedMilliseconds < 30_000) {
    return 1_500;
  }

  return elapsedMilliseconds < 90_000 ? 3_000 : 5_000;
}

/**
 * How long a scan may sit in a between-stages status before the client asks
 * the server to resume it.
 *
 * `card_ready` and `brief_ready` last well under a second while the pipeline
 * is alive — the next stage claims the scan straight away. Seeing one hold for
 * this long means the pipeline stopped: a Flash Brief or Mutual Value failure
 * rolls the scan back to exactly these statuses, and nothing on the server
 * schedules another attempt.
 */
export const stalledScanResumeDelayMilliseconds = 15_000;

export type StallWatch = Readonly<{
  key: string;
  resumed: boolean;
  since: number;
}> | null;

/**
 * Tracks how long the scan has held one between-stages status and says when
 * to request a resume: at most once per `key`, so a scan that stalls again
 * after the retry (or that the server refuses to resume) is not re-requested
 * on every poll. The key should change with the scan, the poll epoch and the
 * status, so a manual refresh or a new stall earns a fresh attempt.
 *
 * `key` is null when the current status is not a between-stages one.
 */
export function watchForStall(
  previous: StallWatch,
  key: string | null,
  nowMilliseconds: number,
): Readonly<{ next: StallWatch; resume: boolean }> {
  if (key === null) {
    return { next: null, resume: false };
  }

  if (previous?.key !== key) {
    return {
      next: { key, resumed: false, since: nowMilliseconds },
      resume: false,
    };
  }

  if (
    !previous.resumed &&
    nowMilliseconds - previous.since >= stalledScanResumeDelayMilliseconds
  ) {
    return { next: { ...previous, resumed: true }, resume: true };
  }

  return { next: previous, resume: false };
}
