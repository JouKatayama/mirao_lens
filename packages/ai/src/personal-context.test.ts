import {
  personalContextOnboardingInputSchema,
  type PersonalContextOnboardingInput,
} from "@miraio/domain";
import { describe, expect, it, vi } from "vitest";

import {
  OpenAIPersonalContextStructurer,
  PersonalContextStructuringError,
} from "./personal-context";

const input: PersonalContextOnboardingInput =
  personalContextOnboardingInputSchema.parse({
    request_id: "00000000-0000-4000-8000-000000000303",
    profile: {
      current_company: "Example Company",
      current_role: "Product Lead",
    },
    answers: {
      offer: "Structured feedback on early concepts",
      expertise: "Product discovery",
    },
    locale: "ja",
  });

describe("OpenAI Personal Context structurer", () => {
  it("maps deterministic structured output into canonical suggestions", async () => {
    const request = vi.fn().mockResolvedValue({
      suggestions: [
        {
          type: "expertise",
          text: " Product discovery ",
          tags: ["product"],
        },
        {
          type: "offer",
          text: "Structured feedback on early concepts",
          tags: ["feedback"],
        },
      ],
    });
    const structurer = new OpenAIPersonalContextStructurer({
      model: "configured-model-alias",
      request,
    });

    await expect(structurer.structure(input)).resolves.toEqual({
      suggestions: [
        {
          type: "expertise",
          text: "Product discovery",
          tags: ["product"],
        },
        {
          type: "offer",
          text: "Structured feedback on early concepts",
          tags: ["feedback"],
        },
      ],
    });
    expect(request).toHaveBeenCalledWith({
      input,
      model: "configured-model-alias",
    });
  });

  it("fails closed on invalid or invented output shapes", async () => {
    const structurer = new OpenAIPersonalContextStructurer({
      model: "configured-model-alias",
      request: async () => ({
        suggestions: [
          {
            type: "personality",
            text: "Invented personality",
            tags: [],
          },
        ],
      }),
    });

    await expect(structurer.structure(input)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("requires an offer grounded in the required offer answer", async () => {
    const structurer = new OpenAIPersonalContextStructurer({
      model: "configured-model-alias",
      request: async () => ({
        suggestions: [
          { type: "expertise", text: "Product discovery", tags: [] },
        ],
      }),
    });

    await expect(structurer.structure(input)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("rejects semantically blank provider suggestions", async () => {
    const structurer = new OpenAIPersonalContextStructurer({
      model: "configured-model-alias",
      request: async () => ({
        suggestions: [{ type: "offer", text: "   ", tags: [] }],
      }),
    });

    await expect(structurer.structure(input)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("maps rate limits without leaking provider error text", async () => {
    const structurer = new OpenAIPersonalContextStructurer({
      model: "configured-model-alias",
      request: async () => {
        throw { status: 429, message: "provider details" };
      },
    });

    const error = await structurer
      .structure(input)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(PersonalContextStructuringError);
    expect(error).toMatchObject({ code: "rate_limited" });
    expect((error as Error).message).not.toContain("provider details");
  });

  it("requires model configuration and a production API key", () => {
    expect(
      () => new OpenAIPersonalContextStructurer({ apiKey: "key", model: " " }),
    ).toThrow(PersonalContextStructuringError);
    expect(
      () => new OpenAIPersonalContextStructurer({ model: "model" }),
    ).toThrow(PersonalContextStructuringError);
  });
});
