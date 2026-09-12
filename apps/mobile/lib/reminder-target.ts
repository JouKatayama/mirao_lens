/**
 * What a reminder points back at.
 *
 * A reminder exists so the user does the thing they agreed to do, which means
 * the notification has to lead somewhere: tapping "〇〇さんへの次の一手" should
 * open that person, not the home screen. The scan id travels in the
 * notification's own payload, because the device may have been offline, asleep
 * or reinstalled between scheduling the reminder and the tap.
 *
 * Parsing lives here, away from expo-notifications, so the shape can be tested
 * against the malformed payloads a real notification store can hand back.
 */
export type ReminderTarget = Readonly<{ scanId: string }>;

export function toReminderTarget(scanId: string): ReminderTarget {
  return { scanId };
}

/**
 * The scan a notification payload names, or null for anything else. Payloads
 * come back from the OS, not from this app's memory: an older build, a
 * hand-rolled test notification, or a truncated payload must route nowhere
 * rather than open an arbitrary screen.
 */
export function readReminderScanId(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const scanId = (data as Record<string, unknown>).scanId;

  if (typeof scanId !== "string") {
    return null;
  }

  const trimmed = scanId.trim();
  return trimmed.length > 0 ? trimmed : null;
}
