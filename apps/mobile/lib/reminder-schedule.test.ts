import { describe, expect, it } from "vitest";

import {
  reminderHourOfDay,
  toReminderDueDate,
  toReminderLabel,
} from "./reminder-schedule";

const afternoon = new Date("2026-09-11T05:00:00.000Z"); // 14:00 JST

describe("toReminderDueDate", () => {
  it("returns nothing when the user asked for no reminder", () => {
    expect(toReminderDueDate("none", afternoon)).toBeNull();
  });

  it("keeps the offset for a reminder due today", () => {
    const due = toReminderDueDate("today", afternoon);

    expect(due?.toISOString()).toBe("2026-09-11T09:00:00.000Z");
  });

  it("moves a later reminder to the morning", () => {
    const due = toReminderDueDate("tomorrow", afternoon);

    expect(due?.getHours()).toBe(reminderHourOfDay);
    expect(due?.getMinutes()).toBe(0);
    expect(due?.getTime()).toBeGreaterThan(afternoon.getTime());
  });

  it("counts the days the choice names", () => {
    const tomorrow = toReminderDueDate("tomorrow", afternoon);
    const threeDays = toReminderDueDate("three_days", afternoon);
    const oneWeek = toReminderDueDate("one_week", afternoon);
    const day = 24 * 60 * 60 * 1000;

    expect(
      Math.round(
        ((threeDays?.getTime() ?? 0) - (tomorrow?.getTime() ?? 0)) / day,
      ),
    ).toBe(2);
    expect(
      Math.round(
        ((oneWeek?.getTime() ?? 0) - (tomorrow?.getTime() ?? 0)) / day,
      ),
    ).toBe(6);
  });

  it("never returns a moment that has already passed", () => {
    // 06:00 local, so rounding a next-day reminder down to 9am would land in
    // the past for any choice measured from a very early hour.
    const earlyMorning = new Date("2026-09-11T21:00:00.000Z");

    for (const choice of [
      "today",
      "tomorrow",
      "three_days",
      "one_week",
    ] as const) {
      const due = toReminderDueDate(choice, earlyMorning);
      expect(due?.getTime()).toBeGreaterThan(earlyMorning.getTime());
    }
  });
});

describe("toReminderLabel", () => {
  it("names the choice", () => {
    expect(toReminderLabel("three_days")).toBe("3日以内");
    expect(toReminderLabel("none")).toBe("リマインドしない");
  });
});
