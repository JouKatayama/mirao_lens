import { describe, expect, it } from "vitest";

import {
  mutualValueInputSchema,
  mutualValuePublicSchema,
  mutualValueSchema,
  mutualValueStructuredOutputSchema,
  normalizeMutualValue,
  MutualValueValidationError,
  scanStatusResponseSchema,
} from "../index";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validStructuredOutput = {
  give: [
    {
      text: "UXリサーチの知見を共有できます",
      claim_type: "hypothesis" as const,
      evidence_ids: [] as string[],
    },
  ],
  get: [
    {
      text: "新規市場への展開事例を学べます",
      claim_type: "hypothesis" as const,
      evidence_ids: [] as string[],
    },
  ],
  bridge: "両者ともデジタル製品のユーザー体験向上に注力しています",
  ask: [
    {
      question: "現在のプロダクト開発で一番の課題は何ですか？",
      validates_hypothesis: "開発速度と品質のバランスに悩んでいる可能性",
    },
  ],
  next_action: {
    action: "来週オンラインでカジュアルに話す機会を設ける",
    timing: "1週間以内",
    reason: "お互いの課題感が近く、早期に話すことで相乗効果が期待できます",
  },
};

// ─── mutualValueStructuredOutputSchema ───────────────────────────────────────

describe("mutualValueStructuredOutputSchema", () => {
  it("accepts valid structured output", () => {
    expect(() =>
      mutualValueStructuredOutputSchema.parse(validStructuredOutput),
    ).not.toThrow();
  });

  it("rejects empty give array", () => {
    expect(() =>
      mutualValueStructuredOutputSchema.parse({ ...validStructuredOutput, give: [] }),
    ).toThrow();
  });

  it("rejects empty get array", () => {
    expect(() =>
      mutualValueStructuredOutputSchema.parse({ ...validStructuredOutput, get: [] }),
    ).toThrow();
  });

  it("rejects invalid claim_type", () => {
    expect(() =>
      mutualValueStructuredOutputSchema.parse({
        ...validStructuredOutput,
        give: [{ text: "value", claim_type: "unknown", evidence_ids: [] }],
      }),
    ).toThrow();
  });

  it("rejects missing evidence_ids in structured output items", () => {
    expect(() =>
      mutualValueStructuredOutputSchema.parse({
        ...validStructuredOutput,
        give: [{ text: "value", claim_type: "fact" }],
      }),
    ).toThrow();
  });

  it("accepts evidence_ids as UUIDs", () => {
    const output = {
      ...validStructuredOutput,
      give: [
        {
          ...validStructuredOutput.give[0],
          evidence_ids: ["00000000-0000-0000-0000-000000000001"],
        },
      ],
    };
    expect(() =>
      mutualValueStructuredOutputSchema.parse(output),
    ).not.toThrow();
  });

  it("accepts null validates_hypothesis in ask", () => {
    const output = {
      ...validStructuredOutput,
      ask: [{ question: "質問", validates_hypothesis: null }],
    };
    expect(() =>
      mutualValueStructuredOutputSchema.parse(output),
    ).not.toThrow();
  });

  it("accepts null timing in next_action", () => {
    const output = {
      ...validStructuredOutput,
      next_action: { ...validStructuredOutput.next_action, timing: null },
    };
    expect(() =>
      mutualValueStructuredOutputSchema.parse(output),
    ).not.toThrow();
  });

  it("rejects extra fields (strict)", () => {
    expect(() =>
      mutualValueStructuredOutputSchema.parse({
        ...validStructuredOutput,
        extra: "field",
      }),
    ).toThrow();
  });
});

// ─── mutualValueSchema ────────────────────────────────────────────────────────

describe("mutualValueSchema", () => {
  it("parses valid structured output", () => {
    const parsed = mutualValueSchema.parse(validStructuredOutput);
    expect(parsed.give[0]?.text).toBe("UXリサーチの知見を共有できます");
    expect(parsed.next_action.timing).toBe("1週間以内");
  });

  it("defaults evidence_ids to [] when absent from stored items (backward compat)", () => {
    const stored = {
      ...validStructuredOutput,
      give: [{ text: "value", claim_type: "hypothesis" as const }],
      get: [{ text: "value2", claim_type: "fact" as const }],
    };
    const parsed = mutualValueSchema.parse(stored);
    expect(parsed.give[0]?.evidence_ids).toEqual([]);
    expect(parsed.get[0]?.evidence_ids).toEqual([]);
  });
});

// ─── mutualValuePublicSchema ──────────────────────────────────────────────────

describe("mutualValuePublicSchema", () => {
  it("accepts a valid mutual value", () => {
    expect(() =>
      mutualValuePublicSchema.parse(validStructuredOutput),
    ).not.toThrow();
  });
});

// ─── mutualValueInputSchema ───────────────────────────────────────────────────

describe("mutualValueInputSchema", () => {
  it("accepts a valid input", () => {
    expect(() =>
      mutualValueInputSchema.parse({
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
        locale: "ja",
        meeting_goal: "networking",
        personal_context: {
          current_company: "ABC Inc.",
          current_role: "UIデザイナー",
          items: [
            {
              type: "offer",
              text: "UXリサーチを得意とします",
              tags: ["ux", "research"],
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("defaults locale to ja", () => {
    const input = mutualValueInputSchema.parse({
      card: { name: null, company: null, department: null, title: null, language: "ja" },
      flash_brief: {
        who: "test",
        why_you: "test",
        say_this: ["test"],
        potential: "test",
      },
      meeting_goal: "networking",
      personal_context: { current_company: null, current_role: null, items: [] },
    });
    expect(input.locale).toBe("ja");
  });
});

// ─── normalizeMutualValue ─────────────────────────────────────────────────────

describe("normalizeMutualValue", () => {
  it("returns a valid MutualValue from structured output", () => {
    const result = normalizeMutualValue(validStructuredOutput);
    expect(result.give[0]?.text).toBe("UXリサーチの知見を共有できます");
    expect(result.ask[0]?.question).toBe(
      "現在のプロダクト開発で一番の課題は何ですか？",
    );
    expect(result.next_action.action).toBe(
      "来週オンラインでカジュアルに話す機会を設ける",
    );
  });

  it("trims whitespace from text fields", () => {
    const result = normalizeMutualValue({
      ...validStructuredOutput,
      bridge: "  trimmed  ",
      next_action: { ...validStructuredOutput.next_action, action: "  action  " },
    });
    expect(result.bridge).toBe("trimmed");
    expect(result.next_action.action).toBe("action");
  });

  it("converts empty timing to null", () => {
    const result = normalizeMutualValue({
      ...validStructuredOutput,
      next_action: { ...validStructuredOutput.next_action, timing: "  " },
    });
    expect(result.next_action.timing).toBeNull();
  });

  it("throws MutualValueValidationError when all give items are blank after trimming", () => {
    expect(() =>
      normalizeMutualValue({
        ...validStructuredOutput,
        give: [{ text: "  ", claim_type: "hypothesis", evidence_ids: [] }],
      }),
    ).toThrow(MutualValueValidationError);
  });

  it("throws MutualValueValidationError when all get items are blank after trimming", () => {
    expect(() =>
      normalizeMutualValue({
        ...validStructuredOutput,
        get: [{ text: "  ", claim_type: "fact", evidence_ids: [] }],
      }),
    ).toThrow(MutualValueValidationError);
  });

  it("preserves evidence_ids from structured output", () => {
    const uuid = "00000000-0000-0000-0000-000000000001";
    const result = normalizeMutualValue({
      ...validStructuredOutput,
      give: [{ ...validStructuredOutput.give[0]!, evidence_ids: [uuid] }],
    });
    expect(result.give[0]?.evidence_ids).toEqual([uuid]);
  });

  it("throws ZodError for invalid input structure", () => {
    expect(() => normalizeMutualValue({ invalid: true })).toThrow();
  });
});

// ─── scanStatusResponseSchema with new states ─────────────────────────────────

describe("scanStatusResponseSchema — deep_enrichment and deep_ready", () => {
  const card = {
    address: null,
    claims: [],
    company: "XYZ株式会社",
    department: null,
    email: null,
    field_confidence: {
      address: 0,
      company: 0,
      department: 0,
      email: 0,
      name: 0,
      phone: 0,
      title: 0,
      website: 0,
    },
    language: "ja",
    name: "山田 太郎",
    phone: null,
    title: "プロダクトマネージャー",
    user_corrected: false,
    website: null,
  };

  const flashBrief = {
    who: "山田さんはXYZ社のPMです",
    why_you: "プロダクト開発の観点が近い",
    say_this: ["最近注力している機能は何ですか？"],
    potential: "共同開発の可能性あり",
  };

  it("parses deep_enrichment status", () => {
    const result = scanStatusResponseSchema.parse({
      card,
      error_code: null,
      flash_brief: flashBrief,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000002",
      status: "deep_enrichment",
    });
    expect(result.status).toBe("deep_enrichment");
    expect(result.mutual_value).toBeNull();
  });

  it("parses deep_ready status with mutual_value", () => {
    const result = scanStatusResponseSchema.parse({
      card,
      error_code: null,
      flash_brief: flashBrief,
      mutual_value: validStructuredOutput,
      scan_id: "00000000-0000-0000-0000-000000000002",
      status: "deep_ready",
    });
    expect(result.status).toBe("deep_ready");
    if (result.status === "deep_ready") {
      expect(result.mutual_value.give[0]?.text).toBe(
        "UXリサーチの知見を共有できます",
      );
    }
  });

  it("rejects deep_ready without mutual_value", () => {
    expect(() =>
      scanStatusResponseSchema.parse({
        card,
        error_code: null,
        flash_brief: flashBrief,
        mutual_value: null,
        scan_id: "00000000-0000-0000-0000-000000000002",
        status: "deep_ready",
      }),
    ).toThrow();
  });

  it("parses existing brief_ready with null mutual_value", () => {
    const result = scanStatusResponseSchema.parse({
      card,
      error_code: null,
      flash_brief: flashBrief,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000002",
      status: "brief_ready",
    });
    expect(result.status).toBe("brief_ready");
    expect(result.mutual_value).toBeNull();
  });
});
