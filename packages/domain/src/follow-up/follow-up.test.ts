import { describe, expect, it } from "vitest";

import {
  followUpDecisionRequestSchema,
  followUpInputSchema,
  normalizeFollowUpJudgement,
  toFollowUpDraftInput,
} from "./follow-up";

const input = followUpInputSchema.parse({
  card: { company: "Example Co", name: "Synthetic Contact", title: "Manager" },
  connections: [],
  meeting_goal: "partnership",
  mutual_value: { bridge: "Shared interest", next_action: "Send a note" },
  next_actions: [],
  note: "Talked about inspection automation.",
  personal_context: { current_company: null, current_role: null, items: [] },
  previous_encounter_count: 0,
});

describe("normalizeFollowUpJudgement", () => {
  it("keeps a confident decision", () => {
    const judgement = normalizeFollowUpJudgement({
      confidence: 0.8,
      decision: "follow_up",
      reasons: [{ claim_type: "fact", source: "note", text: "Asked for info" }],
      timing: "3日以内",
      uncertainty: null,
    });

    expect(judgement.decision).toBe("follow_up");
  });

  it("turns a low-confidence decision into hold with a stated reason", () => {
    const judgement = normalizeFollowUpJudgement({
      confidence: 0.3,
      decision: "no_follow_up",
      reasons: [{ claim_type: "hypothesis", source: "card", text: "Unclear" }],
      timing: null,
      uncertainty: null,
    });

    expect(judgement.decision).toBe("hold");
    expect(judgement.uncertainty).not.toBeNull();
  });

  it("rejects an undeclared decision", () => {
    expect(() =>
      normalizeFollowUpJudgement({
        confidence: 0.9,
        decision: "send_now",
        reasons: [{ claim_type: "fact", source: "note", text: "x" }],
        timing: null,
        uncertainty: null,
      }),
    ).toThrow();
  });
});

describe("toFollowUpDraftInput", () => {
  it("passes only fact reasons and never Mutual Value", () => {
    const draftInput = toFollowUpDraftInput(input, {
      confidence: 0.8,
      decision: "follow_up",
      reasons: [
        { claim_type: "fact", source: "note", text: "Asked for a demo" },
        { claim_type: "hypothesis", source: "mutual_value", text: "May buy" },
      ],
      timing: "来週",
      uncertainty: null,
    });

    expect(draftInput.fact_reasons).toEqual(["Asked for a demo"]);
    expect(draftInput).not.toHaveProperty("mutual_value");
    expect(JSON.stringify(draftInput)).not.toContain("May buy");
  });
});

describe("followUpDecisionRequestSchema", () => {
  it("accepts approval with an edited draft and a plain dismissal", () => {
    expect(
      followUpDecisionRequestSchema.parse({
        draft: { body: "Thanks", subject: "Hello" },
        status: "approved",
      }).status,
    ).toBe("approved");
    expect(
      followUpDecisionRequestSchema.parse({ status: "dismissed" }).status,
    ).toBe("dismissed");
  });

  it("does not accept a send instruction", () => {
    expect(
      followUpDecisionRequestSchema.safeParse({ status: "sent" }).success,
    ).toBe(false);
  });
});
