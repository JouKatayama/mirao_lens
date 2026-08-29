import { cardFieldNames, normalizeCardExtraction } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import { cardExtractionFixtures } from "./card-extraction-fixtures";

describe("synthetic Card Intelligence fixtures", () => {
  it("contains at least ten deterministic non-PII cases", () => {
    expect(cardExtractionFixtures.length).toBeGreaterThanOrEqual(10);
    expect(
      new Set(cardExtractionFixtures.map((fixture) => fixture.caseName)).size,
    ).toBe(cardExtractionFixtures.length);
  });

  it.each(cardExtractionFixtures)(
    "normalizes $caseName into the expected visible fields",
    ({ expectedNonNullFields, providerOutput }) => {
      const result = normalizeCardExtraction(providerOutput);
      const nonNullFields = cardFieldNames.filter(
        (field) => result[field] !== null,
      );

      expect(nonNullFields).toEqual(expectedNonNullFields);
      for (const field of cardFieldNames) {
        if (result[field] === null) {
          expect(result.field_confidence[field]).toBe(0);
        }
      }
    },
  );
});
