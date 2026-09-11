/**
 * Turns the timing the user picks into a concrete moment.
 *
 * The model writes timing as prose ("3日以内"), which reads well and schedules
 * nothing. Rather than parse that back, the user picks from the same phrases
 * and the choice carries the instant with it.
 */
export const reminderChoices = [
  { hoursFromNow: null, label: "リマインドしない", value: "none" },
  { hoursFromNow: 4, label: "今日中", value: "today" },
  { hoursFromNow: 24, label: "明日", value: "tomorrow" },
  { hoursFromNow: 72, label: "3日以内", value: "three_days" },
  { hoursFromNow: 168, label: "1週間以内", value: "one_week" },
] as const;

export type ReminderChoice = (typeof reminderChoices)[number]["value"];

export const reminderHourOfDay = 9;

/**
 * A reminder due tomorrow or later fires at 9am local time: a notification at
 * the minute the note was written, a day later, arrives in the middle of
 * whatever the user is doing. "Today" keeps the offset, because moving it to
 * 9am would either be in the past or miss the day entirely.
 */
export function toReminderDueDate(
  choice: ReminderChoice,
  now: Date,
): Date | null {
  const hours = reminderChoices.find(
    (candidate) => candidate.value === choice,
  )?.hoursFromNow;

  if (!hours) {
    return null;
  }

  const due = new Date(now.getTime() + hours * 60 * 60 * 1000);

  if (hours < 24) {
    return due;
  }

  due.setHours(reminderHourOfDay, 0, 0, 0);

  // Rounding down to 9am can land before now for a choice made early in the
  // morning, which would fire immediately. Push such a reminder to the next
  // day rather than deliver it at once.
  return due.getTime() <= now.getTime()
    ? new Date(due.getTime() + 24 * 60 * 60 * 1000)
    : due;
}

export function toReminderLabel(choice: ReminderChoice): string {
  return (
    reminderChoices.find((candidate) => candidate.value === choice)?.label ??
    "リマインドしない"
  );
}
