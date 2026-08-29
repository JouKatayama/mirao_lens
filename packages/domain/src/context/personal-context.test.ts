import { describe, expect, it } from "vitest";

import {
  normalizePersonalContextStructuredOutput,
  personalContextItemUpdateSchema,
  personalContextOnboardingInputSchema,
  personalContextStructuredOutputSchema,
  personalContextTypes,
  PersonalContextValidationError,
} from "./personal-context";

const validInput = {
  request_id: "00000000-0000-4000-8000-000000000303",
  profile: {
    current_company: " Example Company ",
    current_role: " Product Lead ",
  },
  answers: {
    offer: " Structured feedback on early product concepts ",
  },
  locale: "ja",
};

describe("Personal Context contracts", () => {
  it("keeps the canonical item type list closed", () => {
    expect(personalContextTypes).toEqual([
      "past_experience",
      "expertise",
      "strong_skill",
      "current_theme",
      "offer",
      "seeking",
      "free_text",
    ]);

    expect(() =>
      personalContextStructuredOutputSchema.parse({
        suggestions: [{ type: "personality", text: "Invented", tags: [] }],
      }),
    ).toThrow();
  });

  it("normalizes onboarding input and requires role plus offer", () => {
    const parsed = personalContextOnboardingInputSchema.parse(validInput);

    expect(parsed.profile).toEqual({
      current_company: "Example Company",
      current_role: "Product Lead",
    });
    expect(parsed.answers.offer).toBe(
      "Structured feedback on early product concepts",
    );
    expect(parsed.answers.free_text).toBe("");

    expect(() =>
      personalContextOnboardingInputSchema.parse({
        ...validInput,
        profile: { current_role: " " },
      }),
    ).toThrow();
    expect(() =>
      personalContextOnboardingInputSchema.parse({
        ...validInput,
        answers: { offer: " " },
      }),
    ).toThrow();
  });

  it("rejects approval or unknown fields in provider output", () => {
    expect(() =>
      personalContextStructuredOutputSchema.parse({
        suggestions: [
          {
            type: "offer",
            text: "Structured feedback",
            tags: [],
            user_approved: true,
          },
        ],
      }),
    ).toThrow();
  });

  it("trims, deduplicates, and normalizes provider suggestions", () => {
    expect(
      normalizePersonalContextStructuredOutput({
        suggestions: [
          {
            type: "offer",
            text: " Structured feedback ",
            tags: [" validation ", "validation"],
          },
          {
            type: "offer",
            text: "Structured feedback",
            tags: [],
          },
        ],
      }),
    ).toEqual({
      suggestions: [
        {
          type: "offer",
          text: "Structured feedback",
          tags: ["validation"],
        },
      ],
    });
  });

  it("fails closed when normalized suggestions are blank", () => {
    expect(() =>
      normalizePersonalContextStructuredOutput({
        suggestions: [{ type: "offer", text: " ", tags: [] }],
      }),
    ).toThrow(PersonalContextValidationError);
  });

  it("requires at least one mutable field for item updates", () => {
    expect(personalContextItemUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      personalContextItemUpdateSchema.parse({
        text: "Reviewed text",
        user_approved: true,
      }),
    ).toEqual({ text: "Reviewed text", user_approved: true });
  });
});
