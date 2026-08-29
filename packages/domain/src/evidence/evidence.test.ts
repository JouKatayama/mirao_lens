import { describe, expect, it } from "vitest";

import {
  evidenceItemSchema,
  evidenceListResponseSchema,
  evidenceSourceTypeSchema,
} from "./evidence";

const validItem = {
  confidence: 0.95,
  excerpt: "山田太郎",
  id: "00000000-0000-0000-0000-000000000001",
  retrieved_at: null,
  source_title: "card.name",
  source_type: "business_card" as const,
  source_url: null,
};

describe("evidenceSourceTypeSchema", () => {
  it("accepts all canonical source types", () => {
    const types = [
      "business_card",
      "user_correction",
      "official_company",
      "public_web",
      "user_context",
      "ai_inference",
    ];
    for (const t of types) {
      expect(evidenceSourceTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("rejects unknown source type", () => {
    expect(evidenceSourceTypeSchema.safeParse("web_scrape").success).toBe(
      false,
    );
  });
});

describe("evidenceItemSchema", () => {
  it("accepts a valid evidence item", () => {
    expect(evidenceItemSchema.safeParse(validItem).success).toBe(true);
  });

  it("accepts null nullable fields", () => {
    const result = evidenceItemSchema.safeParse({
      ...validItem,
      excerpt: null,
      retrieved_at: null,
      source_title: null,
      source_url: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects confidence below 0", () => {
    expect(
      evidenceItemSchema.safeParse({ ...validItem, confidence: -0.1 }).success,
    ).toBe(false);
  });

  it("rejects confidence above 1", () => {
    expect(
      evidenceItemSchema.safeParse({ ...validItem, confidence: 1.01 }).success,
    ).toBe(false);
  });

  it("rejects unknown source_type", () => {
    expect(
      evidenceItemSchema.safeParse({
        ...validItem,
        source_type: "unknown_source",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    expect(
      evidenceItemSchema.safeParse({ ...validItem, extra: "field" }).success,
    ).toBe(false);
  });
});

describe("evidenceListResponseSchema", () => {
  it("accepts a valid response with items", () => {
    const result = evidenceListResponseSchema.safeParse({
      items: [validItem],
      scan_id: "00000000-0000-0000-0000-000000000099",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty items array", () => {
    const result = evidenceListResponseSchema.safeParse({
      items: [],
      scan_id: "00000000-0000-0000-0000-000000000099",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid scan_id", () => {
    expect(
      evidenceListResponseSchema.safeParse({
        items: [],
        scan_id: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
