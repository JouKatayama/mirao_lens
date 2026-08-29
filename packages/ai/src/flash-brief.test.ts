import { describe, expect, it, vi } from "vitest";

import {
  FlashBriefGeneratorError,
  OpenAIFlashBriefGenerator,
  type FlashBriefGenerator,
} from "./flash-brief";
import type { FlashBriefInput } from "@miraio/domain";

const validInput: FlashBriefInput = {
  card: {
    company: "XYZ株式会社",
    department: null,
    language: "ja",
    name: "山田 太郎",
    title: "プロダクトマネージャー",
  },
  locale: "ja",
  meeting_goal: "networking",
  personal_context: {
    current_company: "ABC Inc.",
    current_role: "UIデザイナー",
    items: [
      {
        tags: ["design"],
        text: "UIデザイン5年の経験があります。",
        type: "expertise",
      },
    ],
  },
};

const validOutput = {
  identity_status: "medium_confidence" as const,
  potential: "あなたのデザイン力が彼のプロダクトチームに貢献できます。",
  say_this: ["最近のプロダクト開発でどんな課題がありますか？"],
  who: "山田太郎さんはXYZ株式会社のプロダクトマネージャーです。",
  why_you: "あなたのUIデザイン経験と彼のプロダクト課題が重なります。",
};

describe("OpenAIFlashBriefGenerator", () => {
  it("throws configuration error when model is empty", () => {
    expect(
      () => new OpenAIFlashBriefGenerator({ model: "", request: vi.fn() }),
    ).toThrow(FlashBriefGeneratorError);
  });

  it("throws configuration error when no apiKey and no request", () => {
    expect(
      () => new OpenAIFlashBriefGenerator({ model: "gpt-4o" }),
    ).toThrow(FlashBriefGeneratorError);
  });

  it("implements FlashBriefGenerator interface", () => {
    const generator: FlashBriefGenerator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o",
      request: vi.fn(),
    });
    expect(typeof generator.generate).toBe("function");
  });

  it("returns normalized FlashBrief from valid provider output", async () => {
    const request = vi.fn().mockResolvedValue(validOutput);
    const generator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o",
      request,
    });

    const result = await generator.generate(validInput);

    expect(result.who).toBe(validOutput.who);
    expect(result.why_you).toBe(validOutput.why_you);
    expect(result.say_this).toEqual(validOutput.say_this);
    expect(result.potential).toBe(validOutput.potential);
    expect(result.identity_status).toBe("medium_confidence");
  });

  it("preserves identity_status from provider output", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ...validOutput, identity_status: "high_confidence" });
    const generator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o",
      request,
    });

    const result = await generator.generate(validInput);

    expect(result.identity_status).toBe("high_confidence");
  });

  it("passes the correct model to the request", async () => {
    const request = vi.fn().mockResolvedValue(validOutput);
    const generator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o-mini",
      request,
    });

    await generator.generate(validInput);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini" }),
    );
  });

  it("throws invalid_output when provider returns null", async () => {
    const request = vi.fn().mockResolvedValue(null);
    const generator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o",
      request,
    });

    await expect(generator.generate(validInput)).rejects.toThrow(
      FlashBriefGeneratorError,
    );
    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("throws invalid_output when provider returns malformed output", async () => {
    const request = vi.fn().mockResolvedValue({ who: "", say_this: [] });
    const generator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o",
      request,
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("maps 429 response to rate_limited", async () => {
    const request = vi.fn().mockRejectedValue({ status: 429 });
    const generator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o",
      request,
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("maps AbortError to timeout", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const request = vi.fn().mockRejectedValue(abortError);
    const generator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o",
      request,
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("maps unknown provider error to provider_unavailable", async () => {
    const request = vi.fn().mockRejectedValue(new Error("network failure"));
    const generator = new OpenAIFlashBriefGenerator({
      model: "gpt-4o",
      request,
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });
});
