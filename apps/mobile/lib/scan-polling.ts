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
