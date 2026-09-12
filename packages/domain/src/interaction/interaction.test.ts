import { describe, expect, it } from "vitest";

import {
  isNextActionDueUpdate,
  nextActionUpdateRequestSchema,
} from "./interaction";

const actionId = "00000000-0000-4013-8000-000000000901";
const dueAt = "2026-09-14T00:00:00.000Z";

describe("nextActionUpdateRequestSchema", () => {
  it("accepts settling an action", () => {
    const parsed = nextActionUpdateRequestSchema.parse({
      action_id: actionId,
      status: "completed",
    });

    expect(isNextActionDueUpdate(parsed)).toBe(false);
  });

  it("accepts re-timing an action, and clearing its reminder", () => {
    const timed = nextActionUpdateRequestSchema.parse({
      action_id: actionId,
      due_at: dueAt,
    });
    const cleared = nextActionUpdateRequestSchema.parse({
      action_id: actionId,
      due_at: null,
    });

    expect(isNextActionDueUpdate(timed)).toBe(true);
    expect(isNextActionDueUpdate(cleared)).toBe(true);
  });

  it("refuses a body that settles and re-times at once", () => {
    // Both halves are strict, which is what keeps them apart: a request that
    // named the two would leave the handler to guess which one was meant.
    expect(
      nextActionUpdateRequestSchema.safeParse({
        action_id: actionId,
        due_at: dueAt,
        status: "completed",
      }).success,
    ).toBe(false);
  });

  it("refuses a due moment that is not an instant", () => {
    // `timing_text` holds the wording the user read ("3日以内"); a reminder
    // needs a moment that can actually be scheduled.
    expect(
      nextActionUpdateRequestSchema.safeParse({
        action_id: actionId,
        due_at: "3日以内",
      }).success,
    ).toBe(false);
  });

  it("refuses an action id that is not a UUID", () => {
    expect(
      nextActionUpdateRequestSchema.safeParse({
        action_id: "nope",
        due_at: null,
      }).success,
    ).toBe(false);
  });
});
