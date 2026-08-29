import { describe, expect, it } from "vitest";

import {
  createOnboardingInput,
  createOnboardingRequestId,
  emptyOnboardingForm,
  hasUsablePersonalContext,
} from "./context-form";

describe("Personal Context mobile flow helpers", () => {
  it("maps the Japanese form into the canonical API contract", () => {
    expect(
      createOnboardingInput(
        {
          ...emptyOnboardingForm,
          currentRole: " Product Lead ",
          offer: " Structured concept feedback ",
        },
        "00000000-0000-4000-8000-000000000303",
      ),
    ).toMatchObject({
      profile: { current_role: "Product Lead" },
      answers: { offer: "Structured concept feedback" },
    });
  });

  it("creates UUID-shaped idempotency keys", () => {
    expect(createOnboardingRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("requires approved offer context and a current role", () => {
    expect(
      hasUsablePersonalContext({
        profile: { current_company: null, current_role: "Product Lead" },
        items: [],
      }),
    ).toBe(false);
    expect(
      hasUsablePersonalContext({
        profile: { current_company: null, current_role: "Product Lead" },
        items: [
          {
            id: "00000000-0000-4000-8000-000000000333",
            type: "offer",
            text: "Structured feedback",
            tags: [],
            source_type: "ai_suggested",
            user_approved: true,
            created_at: "2026-08-17T00:00:00.000Z",
            updated_at: "2026-08-17T00:00:00.000Z",
          },
        ],
      }),
    ).toBe(true);
  });
});
