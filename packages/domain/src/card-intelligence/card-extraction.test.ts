import { describe, expect, it } from "vitest";

import {
  businessCardRecordSchema,
  cardCorrectionSchema,
  cardExtractionSchema,
  createCardFactClaims,
  normalizeCardExtraction,
  toBusinessCardPublic,
} from "./card-extraction";

const confidence = {
  address: 0,
  company: 0,
  department: 0,
  email: 0,
  name: 0,
  phone: 0,
  title: 0,
  website: 0,
};

describe("Card Intelligence contracts", () => {
  it("normalizes whitespace and forces null fields to zero confidence", () => {
    expect(
      normalizeCardExtraction({
        address: null,
        company: " Miraio Example ",
        department: "   ",
        email: null,
        field_confidence: {
          ...confidence,
          company: 0.97,
          department: 0.81,
          name: 0.92,
        },
        language: " JA ",
        name: " Mira Testperson ",
        phone: null,
        title: null,
        website: null,
      }),
    ).toMatchObject({
      company: "Miraio Example",
      department: null,
      field_confidence: { department: 0 },
      language: "ja",
      name: "Mira Testperson",
    });
  });

  it("rejects missing fields, unknown fields, and out-of-range confidence", () => {
    expect(() =>
      normalizeCardExtraction({
        company: null,
        field_confidence: { ...confidence, company: 1.2 },
        language: "ja",
      }),
    ).toThrow();
    expect(() =>
      normalizeCardExtraction({
        address: null,
        company: null,
        department: null,
        email: null,
        extra: "not allowed",
        field_confidence: confidence,
        language: "ja",
        name: null,
        phone: null,
        title: null,
        website: null,
      }),
    ).toThrow();
  });

  it("enforces zero confidence for canonical null fields", () => {
    expect(() =>
      cardExtractionSchema.parse({
        address: null,
        company: null,
        department: null,
        email: null,
        field_confidence: { ...confidence, name: 0.4 },
        language: "ja",
        name: null,
        phone: null,
        title: null,
        website: null,
      }),
    ).toThrow();
  });

  it("accepts partial corrections but rejects empty or whitespace values", () => {
    expect(cardCorrectionSchema.parse({ title: "CTO" })).toEqual({
      title: "CTO",
    });
    expect(cardCorrectionSchema.parse({ department: null })).toEqual({
      department: null,
    });
    expect(() => cardCorrectionSchema.parse({})).toThrow();
    expect(() => cardCorrectionSchema.parse({ title: "   " })).toThrow();
    expect(() => cardCorrectionSchema.parse({ confidence: 1 })).toThrow();
  });

  it("projects every non-null card value as an explicit fact", () => {
    const fields = {
      address: null,
      company: "Miraio Example",
      department: null,
      email: "mira.test@example.invalid",
      name: "Mira Testperson",
      phone: null,
      title: "Product Lead",
      website: null,
    };
    const claims = createCardFactClaims(fields, {
      ...confidence,
      company: 0.98,
      email: 0.96,
      name: 0.99,
      title: 0.97,
    });

    expect(claims).toHaveLength(4);
    expect(claims).toContainEqual({
      claim_type: "fact",
      confidence: 0.98,
      field: "company",
      source_type: "business_card",
      value: "Miraio Example",
    });
    expect(
      createCardFactClaims(
        fields,
        {
          ...confidence,
          company: 1,
          email: 0.96,
          name: 0.99,
          title: 0.97,
        },
        ["company"],
      ),
    ).toContainEqual({
      claim_type: "fact",
      confidence: 1,
      field: "company",
      source_type: "user_correction",
      value: "Miraio Example",
    });
  });

  it("keeps original extraction private while projecting a public card", () => {
    const extraction = normalizeCardExtraction({
      address: null,
      company: "Miraio Example",
      department: null,
      email: null,
      field_confidence: { ...confidence, company: 0.98, name: 0.99 },
      language: "en",
      name: "Mira Testperson",
      phone: null,
      title: null,
      website: null,
    });
    const record = businessCardRecordSchema.parse({
      ...extraction,
      created_at: "2026-08-17T00:00:00+00:00",
      extraction_json: extraction,
      id: "00000000-0000-4000-8000-000000000505",
      scan_id: "00000000-0000-4000-8000-000000000504",
      updated_at: "2026-08-17T00:00:00+00:00",
      user_corrected: false,
    });
    const result = toBusinessCardPublic(record);

    expect(result.claims).toHaveLength(2);
    expect(result).not.toHaveProperty("extraction_json");
    expect(result).not.toHaveProperty("id");
  });
});
