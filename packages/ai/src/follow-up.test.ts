import { followUpInputSchema, type FollowUpDraftInput } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  FollowUpStageError,
  OpenAIFollowUpDrafter,
  OpenAIFollowUpJudge,
} from "./follow-up";

const input = followUpInputSchema.parse({
  card: { company: "Example Co", name: "Synthetic Contact", title: null },
  connections: [],
  meeting_goal: "networking",
  mutual_value: null,
  next_actions: [],
  note: null,
  personal_context: { current_company: null, current_role: null, items: [] },
  previous_encounter_count: 0,
});

const draftInput: FollowUpDraftInput = {
  card: input.card,
  fact_reasons: [],
  locale: "ja",
  meeting_goal: "networking",
  note: null,
  personal_context: input.personal_context,
  timing: null,
};

describe("OpenAIFollowUpJudge", () => {
  it("normalizes a low-confidence decision to hold", async () => {
    const judge = new OpenAIFollowUpJudge({
      model: "test-model",
      request: async () => ({
        confidence: 0.2,
        decision: "follow_up",
        reasons: [{ claim_type: "hypothesis", source: "card", text: "仮説" }],
        timing: "3日以内",
        uncertainty: null,
      }),
    });

    await expect(judge.judge(input)).resolves.toMatchObject({
      decision: "hold",
    });
  });

  it("reports malformed output as invalid_output", async () => {
    const judge = new OpenAIFollowUpJudge({
      model: "test-model",
      request: async () => ({ decision: "follow_up" }),
    });

    await expect(judge.judge(input)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("requires a model and an API key", () => {
    expect(() => new OpenAIFollowUpJudge({ model: " " })).toThrow(
      FollowUpStageError,
    );
    expect(() => new OpenAIFollowUpJudge({ model: "m" })).toThrow(
      FollowUpStageError,
    );
  });
});

describe("OpenAIFollowUpDrafter", () => {
  it("returns a validated draft", async () => {
    const drafter = new OpenAIFollowUpDrafter({
      model: "test-model",
      request: async () => ({
        body: "本日はありがとうございました。",
        subject: "御礼",
      }),
    });

    await expect(drafter.draft(draftInput)).resolves.toEqual({
      body: "本日はありがとうございました。",
      subject: "御礼",
    });
  });

  it("rejects an empty draft", async () => {
    const drafter = new OpenAIFollowUpDrafter({
      model: "test-model",
      request: async () => ({ body: "", subject: "" }),
    });

    await expect(drafter.draft(draftInput)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });
});
