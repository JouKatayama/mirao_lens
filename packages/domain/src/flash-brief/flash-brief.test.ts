import { describe, expect, it } from "vitest";

import {
  flashBriefInputSchema,
  flashBriefPublicSchema,
  flashBriefSchema,
  flashBriefStructuredOutputSchema,
  FlashBriefValidationError,
  normalizeFlashBrief,
  scanStatusResponseSchema,
  type FlashBrief,
  type ScanStatusResponse,
} from "./flash-brief";

const validStructuredOutput = {
  identity_status: "medium_confidence" as const,
  potential: "あなたのUI/UX知識が彼のチームに役立つ可能性があります。",
  say_this: ["最近のプロダクト開発でどんな課題がありますか？"],
  who: "山田太郎さんはXYZ社のプロダクトマネージャーです。",
  why_you: "あなたのプロダクト経験と彼の会社が注力するSaaSが重なっています。",
};

const validFlashBrief: FlashBrief = validStructuredOutput;

describe("flashBriefStructuredOutputSchema", () => {
  it("accepts valid output", () => {
    expect(
      flashBriefStructuredOutputSchema.safeParse(validStructuredOutput).success,
    ).toBe(true);
  });

  it("accepts 3 say_this items", () => {
    const input = {
      ...validStructuredOutput,
      say_this: ["Item 1", "Item 2", "Item 3"],
    };
    expect(flashBriefStructuredOutputSchema.safeParse(input).success).toBe(
      true,
    );
  });

  it("rejects empty who", () => {
    const input = { ...validStructuredOutput, who: "" };
    expect(flashBriefStructuredOutputSchema.safeParse(input).success).toBe(
      false,
    );
  });

  it("rejects more than 3 say_this items", () => {
    const input = {
      ...validStructuredOutput,
      say_this: ["A", "B", "C", "D"],
    };
    expect(flashBriefStructuredOutputSchema.safeParse(input).success).toBe(
      false,
    );
  });

  it("rejects empty say_this array", () => {
    const input = { ...validStructuredOutput, say_this: [] };
    expect(flashBriefStructuredOutputSchema.safeParse(input).success).toBe(
      false,
    );
  });

  it("rejects unknown fields (strict)", () => {
    const input = { ...validStructuredOutput, extra: "field" };
    expect(flashBriefStructuredOutputSchema.safeParse(input).success).toBe(
      false,
    );
  });

  it("rejects missing identity_status", () => {
    const { identity_status: _omit, ...withoutStatus } = validStructuredOutput;
    expect(
      flashBriefStructuredOutputSchema.safeParse(withoutStatus).success,
    ).toBe(false);
  });

  it("rejects invalid identity_status value", () => {
    const input = { ...validStructuredOutput, identity_status: "unknown" };
    expect(flashBriefStructuredOutputSchema.safeParse(input).success).toBe(
      false,
    );
  });
});

describe("flashBriefSchema", () => {
  it("accepts valid brief", () => {
    expect(flashBriefSchema.safeParse(validFlashBrief).success).toBe(true);
  });

  it("defaults identity_status to unresolved when absent", () => {
    const { identity_status: _omit, ...withoutStatus } = validFlashBrief;
    const parsed = flashBriefSchema.parse(withoutStatus);
    expect(parsed.identity_status).toBe("unresolved");
  });

  it("trims whitespace from fields", () => {
    const parsed = flashBriefSchema.parse({
      potential: "  potential text  ",
      say_this: ["  starter  "],
      who: "  who text  ",
      why_you: "  why text  ",
    });
    expect(parsed.who).toBe("who text");
    expect(parsed.why_you).toBe("why text");
    expect(parsed.say_this[0]).toBe("starter");
    expect(parsed.potential).toBe("potential text");
  });
});

describe("flashBriefPublicSchema", () => {
  it("is identical to flashBriefSchema", () => {
    expect(flashBriefPublicSchema.safeParse(validFlashBrief).success).toBe(
      true,
    );
  });
});

describe("flashBriefInputSchema", () => {
  const validInput = {
    card: {
      company: "XYZ株式会社",
      department: null,
      language: "ja",
      name: "山田 太郎",
      title: "プロダクトマネージャー",
    },
    meeting_goal: "networking" as const,
    personal_context: {
      current_company: "ABC Inc.",
      current_role: "UIデザイナー",
      items: [
        {
          tags: ["design", "product"],
          text: "UIデザイン5年の経験",
          type: "expertise" as const,
        },
      ],
    },
  };

  it("accepts valid input", () => {
    expect(flashBriefInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("defaults locale to ja", () => {
    const result = flashBriefInputSchema.parse(validInput);
    expect(result.locale).toBe("ja");
  });

  it("accepts custom locale", () => {
    const result = flashBriefInputSchema.parse({ ...validInput, locale: "en" });
    expect(result.locale).toBe("en");
  });

  it("accepts null card fields", () => {
    const input = {
      ...validInput,
      card: {
        company: null,
        department: null,
        language: "und",
        name: null,
        title: null,
      },
    };
    expect(flashBriefInputSchema.safeParse(input).success).toBe(true);
  });

  it("accepts empty personal context items", () => {
    const input = {
      ...validInput,
      personal_context: { ...validInput.personal_context, items: [] },
    };
    expect(flashBriefInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("normalizeFlashBrief", () => {
  it("returns a normalized brief from valid structured output", () => {
    const result = normalizeFlashBrief(validStructuredOutput);
    expect(result.who).toBe(validStructuredOutput.who);
    expect(result.why_you).toBe(validStructuredOutput.why_you);
    expect(result.say_this).toEqual(validStructuredOutput.say_this);
    expect(result.potential).toBe(validStructuredOutput.potential);
    expect(result.identity_status).toBe("medium_confidence");
  });

  it("trims whitespace in all fields", () => {
    const result = normalizeFlashBrief({
      ...validStructuredOutput,
      potential: "  potential  ",
      say_this: ["  starter one  ", "  starter two  "],
      who: "  who  ",
      why_you: "  why  ",
    });
    expect(result.who).toBe("who");
    expect(result.why_you).toBe("why");
    expect(result.say_this).toEqual(["starter one", "starter two"]);
    expect(result.potential).toBe("potential");
  });

  it("filters blank say_this entries after trimming", () => {
    const result = normalizeFlashBrief({
      ...validStructuredOutput,
      say_this: ["  ", "valid starter", "  "],
    });
    expect(result.say_this).toEqual(["valid starter"]);
  });

  it("throws FlashBriefValidationError when all say_this entries are blank", () => {
    expect(() =>
      normalizeFlashBrief({
        ...validStructuredOutput,
        say_this: ["  ", "  "],
      }),
    ).toThrow(FlashBriefValidationError);
  });

  it("throws ZodError for invalid input schema", () => {
    expect(() => normalizeFlashBrief({ who: "" })).toThrow();
  });
});

describe("scanStatusResponseSchema", () => {
  it("parses extracting status", () => {
    const input = {
      card: null,
      error_code: null,
      flash_brief: null,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000001",
      status: "extracting",
    };
    const result = scanStatusResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const response: ScanStatusResponse = result.data;
      expect(response.status).toBe("extracting");
    }
  });

  it("parses card_ready status with card data", () => {
    const card = {
      address: null,
      claims: [],
      company: "XYZ社",
      department: null,
      email: null,
      field_confidence: {
        address: 0,
        company: 0.95,
        department: 0,
        email: 0,
        name: 0.98,
        phone: 0,
        title: 0.9,
        website: 0,
      },
      language: "ja",
      name: "山田太郎",
      phone: null,
      title: "PM",
      user_corrected: false,
      website: null,
    };
    const input = {
      card,
      error_code: null,
      flash_brief: null,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000001",
      status: "card_ready",
    };
    const result = scanStatusResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("parses generating_brief status with card but no brief", () => {
    const card = {
      address: null,
      claims: [],
      company: "XYZ社",
      department: null,
      email: null,
      field_confidence: {
        address: 0,
        company: 0.95,
        department: 0,
        email: 0,
        name: 0.98,
        phone: 0,
        title: 0.9,
        website: 0,
      },
      language: "ja",
      name: "山田太郎",
      phone: null,
      title: "PM",
      user_corrected: false,
      website: null,
    };
    const input = {
      card,
      error_code: null,
      flash_brief: null,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000001",
      status: "generating_brief",
    };
    const result = scanStatusResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("parses brief_ready status with card and brief", () => {
    const card = {
      address: null,
      claims: [],
      company: "XYZ社",
      department: null,
      email: null,
      field_confidence: {
        address: 0,
        company: 0.95,
        department: 0,
        email: 0,
        name: 0.98,
        phone: 0,
        title: 0.9,
        website: 0,
      },
      language: "ja",
      name: "山田太郎",
      phone: null,
      title: "PM",
      user_corrected: false,
      website: null,
    };
    const input = {
      card,
      error_code: null,
      flash_brief: validFlashBrief,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000001",
      status: "brief_ready",
    };
    const result = scanStatusResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("parses failed_retryable status", () => {
    const input = {
      card: null,
      error_code: "rate_limited",
      flash_brief: null,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000001",
      status: "failed_retryable",
    };
    const result = scanStatusResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("parses failed_terminal status with null error_code", () => {
    const input = {
      card: null,
      error_code: null,
      flash_brief: null,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000001",
      status: "failed_terminal",
    };
    const result = scanStatusResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects unknown status", () => {
    const input = {
      card: null,
      error_code: null,
      flash_brief: null,
      mutual_value: null,
      scan_id: "00000000-0000-0000-0000-000000000001",
      status: "unknown_status",
    };
    expect(scanStatusResponseSchema.safeParse(input).success).toBe(false);
  });
});
