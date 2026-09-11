import type { BusinessCardPublic } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import { fieldNeedsReview } from "./card-review";

function card(overrides: Partial<BusinessCardPublic> = {}): BusinessCardPublic {
  return {
    address: null,
    claims: [],
    company: "株式会社サンプル",
    department: null,
    email: null,
    field_confidence: {
      address: 0,
      company: 0.95,
      department: 0,
      email: 0,
      name: 0.5,
      phone: 0,
      title: 0.69,
      website: 0,
    },
    language: "ja",
    name: "架空 花子",
    phone: null,
    title: "部長",
    user_corrected: false,
    website: null,
    ...overrides,
  };
}

describe("fieldNeedsReview", () => {
  it("flags a reading below the confidence threshold", () => {
    expect(fieldNeedsReview(card(), "name")).toBe(true);
    expect(fieldNeedsReview(card(), "title")).toBe(true);
  });

  it("leaves a confident reading alone", () => {
    expect(fieldNeedsReview(card(), "company")).toBe(false);
  });

  it("never flags a blank field", () => {
    expect(fieldNeedsReview(card(), "email")).toBe(false);
  });

  it("stops flagging a field once the user has corrected it", () => {
    const corrected = card({
      claims: [
        {
          claim_type: "fact",
          confidence: 0.5,
          field: "name",
          source_type: "user_correction",
          value: "架空 花子",
        },
      ],
      user_corrected: true,
    });

    expect(fieldNeedsReview(corrected, "name")).toBe(false);
    // Correcting one field says nothing about the others.
    expect(fieldNeedsReview(corrected, "title")).toBe(true);
  });
});
