import { describe, expect, it } from "vitest";

import { MutualValueGeneratorError, OpenAIMutualValueGenerator } from "./mutual-value";

const validInput = {
  card: {
    name: "山田 太郎",
    company: "XYZ株式会社",
    department: null,
    title: "プロダクトマネージャー",
    language: "ja",
  },
  flash_brief: {
    who: "山田さんはXYZ社のPMです",
    why_you: "プロダクト開発の観点が近い",
    say_this: ["最近注力している機能は何ですか？"],
    potential: "共同開発の可能性あり",
  },
  locale: "ja" as const,
  meeting_goal: "networking" as const,
  personal_context: {
    current_company: "ABC Inc.",
    current_role: "UIデザイナー",
    items: [
      {
        type: "offer" as const,
        text: "UXリサーチを得意とします",
        tags: ["ux"],
      },
    ],
  },
};

const validOutput = {
  give: [{ text: "UXリサーチの知見", claim_type: "hypothesis" as const, evidence_ids: [] as string[] }],
  get: [{ text: "市場展開事例", claim_type: "hypothesis" as const, evidence_ids: [] as string[] }],
  bridge: "両者ともデジタル製品に注力",
  ask: [{ question: "課題は何ですか？", validates_hypothesis: null }],
  next_action: {
    action: "来週話す",
    timing: "1週間以内",
    reason: "相乗効果が期待できます",
  },
};

describe("OpenAIMutualValueGenerator — configuration errors", () => {
  it("throws configuration error for empty model string", () => {
    expect(
      () => new OpenAIMutualValueGenerator({ apiKey: "key", model: "" }),
    ).toThrow(MutualValueGeneratorError);
  });

  it("throws configuration error for missing api key without request override", () => {
    expect(
      () => new OpenAIMutualValueGenerator({ apiKey: "", model: "gpt-4o" }),
    ).toThrow(MutualValueGeneratorError);
  });

  it("constructs with injected request (no api key required)", () => {
    expect(
      () =>
        new OpenAIMutualValueGenerator({
          model: "gpt-4o",
          request: async () => validOutput,
        }),
    ).not.toThrow();
  });
});

describe("OpenAIMutualValueGenerator — generate", () => {
  it("returns normalized MutualValue on success", async () => {
    const generator = new OpenAIMutualValueGenerator({
      model: "gpt-4o",
      request: async () => validOutput,
    });

    const result = await generator.generate(validInput);
    expect(result.give[0]?.text).toBe("UXリサーチの知見");
    expect(result.ask[0]?.question).toBe("課題は何ですか？");
    expect(result.next_action.timing).toBe("1週間以内");
  });

  it("throws invalid_output when request returns null", async () => {
    const generator = new OpenAIMutualValueGenerator({
      model: "gpt-4o",
      request: async () => null,
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("throws invalid_output for schema-invalid output", async () => {
    const generator = new OpenAIMutualValueGenerator({
      model: "gpt-4o",
      request: async () => ({ not_a_valid_field: true }),
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("maps 429 to rate_limited", async () => {
    const generator = new OpenAIMutualValueGenerator({
      model: "gpt-4o",
      request: async () => {
        throw Object.assign(new Error("rate limited"), { status: 429 });
      },
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("maps AbortError to timeout", async () => {
    const generator = new OpenAIMutualValueGenerator({
      model: "gpt-4o",
      request: async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("maps unknown errors to provider_unavailable", async () => {
    const generator = new OpenAIMutualValueGenerator({
      model: "gpt-4o",
      request: async () => {
        throw new Error("unknown failure");
      },
    });

    await expect(generator.generate(validInput)).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });
});
