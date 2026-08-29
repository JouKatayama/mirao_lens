import { describe, expect, it, vi } from "vitest";

import { CardExtractionError, OpenAICardExtractor } from "./card-extraction";

const zeroConfidence = {
  address: 0,
  company: 0,
  department: 0,
  email: 0,
  name: 0,
  phone: 0,
  title: 0,
  website: 0,
};

const output = {
  address: null,
  company: " Example Invalid Labs ",
  department: null,
  email: "card@example.invalid",
  field_confidence: {
    ...zeroConfidence,
    company: 0.98,
    email: 0.99,
    name: 0.97,
    title: 0.96,
  },
  language: " EN ",
  name: "Mira Testperson",
  phone: null,
  title: "Product Lead",
  website: null,
};

describe("OpenAI Card Extractor", () => {
  it("sends a private in-memory image and normalizes structured output", async () => {
    const request = vi.fn().mockResolvedValue(output);
    const extractor = new OpenAICardExtractor({
      model: "configured-card-model",
      request,
    });

    await expect(
      extractor.extract({
        bytes: new Uint8Array([255, 216, 255]).buffer,
        contentType: "image/jpeg",
      }),
    ).resolves.toMatchObject({
      company: "Example Invalid Labs",
      language: "en",
      name: "Mira Testperson",
    });
    expect(request).toHaveBeenCalledWith({
      dataUrl: "data:image/jpeg;base64,/9j/",
      model: "configured-card-model",
    });
  });

  it("fails closed on invalid schema output", async () => {
    const extractor = new OpenAICardExtractor({
      model: "configured-card-model",
      request: async () => ({ ...output, inferred_personality: "outgoing" }),
    });

    await expect(
      extractor.extract({
        bytes: new ArrayBuffer(1),
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("forces confidence to zero when a provider returns a blank field", async () => {
    const extractor = new OpenAICardExtractor({
      model: "configured-card-model",
      request: async () => ({
        ...output,
        department: "   ",
        field_confidence: { ...output.field_confidence, department: 0.8 },
      }),
    });

    await expect(
      extractor.extract({
        bytes: new ArrayBuffer(1),
        contentType: "image/webp",
      }),
    ).resolves.toMatchObject({
      department: null,
      field_confidence: { department: 0 },
    });
  });

  it("maps rate limits without leaking provider messages", async () => {
    const extractor = new OpenAICardExtractor({
      model: "configured-card-model",
      request: async () => {
        throw { message: "raw provider text", status: 429 };
      },
    });
    const error = await extractor
      .extract({ bytes: new ArrayBuffer(1), contentType: "image/heic" })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CardExtractionError);
    expect(error).toMatchObject({ code: "rate_limited" });
    expect((error as Error).message).not.toContain("raw provider text");
  });

  it("rejects empty image input before a provider call", async () => {
    const request = vi.fn();
    const extractor = new OpenAICardExtractor({
      model: "configured-card-model",
      request,
    });

    await expect(
      extractor.extract({
        bytes: new ArrayBuffer(0),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "invalid_output" });
    expect(request).not.toHaveBeenCalled();
  });

  it("requires model configuration and a production API key", () => {
    expect(
      () => new OpenAICardExtractor({ apiKey: "key", model: " " }),
    ).toThrow(CardExtractionError);
    expect(
      () => new OpenAICardExtractor({ model: "configured-card-model" }),
    ).toThrow(CardExtractionError);
  });
});
