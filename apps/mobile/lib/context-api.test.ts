import type { PersonalContextOnboardingInput } from "@miraio/domain";
import { describe, expect, it, vi } from "vitest";

import { ContextApiError, PersonalContextApiClient } from "./context-api";

const item = {
  id: "00000000-0000-4000-8000-000000000333",
  type: "offer",
  text: "Structured feedback",
  tags: [],
  source_type: "ai_suggested",
  user_approved: true,
  created_at: "2026-08-17T00:00:00.000Z",
  updated_at: "2026-08-17T00:00:00.000Z",
};

describe("PersonalContextApiClient", () => {
  it("sends the bearer token and parses approved context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        profile: { current_company: null, current_role: "Product Lead" },
        items: [item],
      }),
    );
    const client = new PersonalContextApiClient(
      "https://api.example.invalid",
      fetchMock,
    );

    await expect(client.getApproved("access-token")).resolves.toMatchObject({
      items: [item],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/v1/context",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("posts onboarding with a stable request ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          profile: { current_company: null, current_role: "Product Lead" },
          suggestions: [{ ...item, user_approved: false }],
        },
        { status: 201 },
      ),
    );
    const client = new PersonalContextApiClient(
      "https://api.example.invalid",
      fetchMock,
    );
    const input: PersonalContextOnboardingInput = {
      request_id: "00000000-0000-4000-8000-000000000303",
      profile: { current_company: null, current_role: "Product Lead" },
      answers: {
        past_experience: "",
        expertise: "",
        strong_skills: "",
        current_themes: "",
        offer: "Structured feedback",
        seeking: "",
        free_text: "",
      },
      locale: "ja",
    };

    await client.createOnboarding("access-token", input);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/v1/context/onboarding",
      expect.objectContaining({ body: JSON.stringify(input), method: "POST" }),
    );
  });

  it("maps non-success responses to a typed public error", async () => {
    const client = new PersonalContextApiClient(
      "https://api.example.invalid",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: "unauthorized", message: "Sign in again." } },
            { status: 401 },
          ),
        ),
    );

    const error = await client.getApproved("expired").catch((cause) => cause);

    expect(error).toBeInstanceOf(ContextApiError);
    expect(error).toMatchObject({ code: "unauthorized", status: 401 });
  });
});
