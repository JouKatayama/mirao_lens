import { cardFieldNames } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  formatCardFieldSummary,
  normalizeFieldValue,
  scoreCardTextCase,
  summarizeCardTextScores,
} from "./card-field-scoring";
import { cardTextFixtures } from "./card-text-fixtures";

const fixtureByName = (caseName: string) => {
  const fixture = cardTextFixtures.find(
    (candidate) => candidate.caseName === caseName,
  );

  if (!fixture) {
    throw new Error(`Unknown fixture: ${caseName}`);
  }

  return fixture;
};

describe("card text fixtures", () => {
  it("names every case exactly once", () => {
    const names = cardTextFixtures.map((fixture) => fixture.caseName);

    expect(new Set(names).size).toBe(names.length);
    expect(cardTextFixtures.length).toBeGreaterThanOrEqual(20);
  });

  it("only expects values that are visible on the card", () => {
    // A ground truth the card does not show would be measuring inference
    // rather than reading, and the transcription stage is explicitly forbidden
    // from inferring. `logo-only-company` is the case that pins this down: the
    // company is absent from the lines, so its expectation must stay null.
    // Whitespace is dropped from both sides: the claim being checked is that
    // these characters are printed on the card, not that a value preserves the
    // card's line breaks. An alternative that joins two printed lines with a
    // space is still made only of visible characters.
    const withoutWhitespace = (value: string) => value.replace(/\s+/gu, "");

    for (const fixture of cardTextFixtures) {
      const visible = withoutWhitespace(fixture.ocrLines.join("\n"));

      for (const field of cardFieldNames) {
        const expected = fixture.expected[field];

        if (expected === null) {
          continue;
        }

        for (const line of expected.split("\n")) {
          expect(visible, `${fixture.caseName}.${field}: ${line}`).toContain(
            withoutWhitespace(line),
          );
        }
      }

      for (const [field, alternatives] of Object.entries(
        fixture.alternatives ?? {},
      )) {
        for (const alternative of alternatives ?? []) {
          for (const line of alternative.split("\n")) {
            expect(
              visible,
              `${fixture.caseName}.${field} alternative: ${line}`,
            ).toContain(withoutWhitespace(line));
          }
        }
      }
    }
  });

  it("expects trimmed, non-empty values", () => {
    for (const fixture of cardTextFixtures) {
      for (const field of cardFieldNames) {
        const expected = fixture.expected[field];

        if (expected === null) {
          continue;
        }

        expect(expected, `${fixture.caseName}.${field}`).toBe(expected.trim());
        expect(expected.length, `${fixture.caseName}.${field}`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("carries no address, mailbox, or number that could belong to a real person", () => {
    // The execution plans forbid real identities in fixtures. Checking it here
    // makes that a build failure rather than a review habit.
    const mailboxPattern = /\S+@\S+/gu;
    const postalPattern = /〒\d{3}-\d{4}/gu;

    for (const fixture of cardTextFixtures) {
      const text = fixture.ocrLines.join("\n");

      for (const mailbox of text.match(mailboxPattern) ?? []) {
        expect(mailbox, fixture.caseName).toMatch(/\.invalid$/u);
      }

      // Hosts and numbers are scanned only after mailboxes and postal codes are
      // removed: an address's local part looks like a domain, and a postal code
      // looks like a phone number.
      const remaining = text
        .replace(mailboxPattern, " ")
        .replace(postalPattern, " ");

      for (const host of remaining.match(/(?:www\.)?[\w-]+\.[a-z]{2,}/giu) ??
        []) {
        expect(host, fixture.caseName).toMatch(/\.invalid$/u);
      }

      for (const phone of remaining.match(/[+\d][\d-]{6,}/gu) ?? []) {
        expect(phone, fixture.caseName).toContain("555");
      }
    }
  });
});

describe("scoreCardTextCase", () => {
  it("scores a correct reading as a full match", () => {
    const fixture = fixtureByName("japanese-standard");
    const score = scoreCardTextCase(fixture, fixture.expected);

    expect(score.matchedFields).toBe(cardFieldNames.length);
  });

  it("accepts a documented alternative rendering", () => {
    const fixture = fixtureByName("bilingual-japanese-english");
    const score = scoreCardTextCase(fixture, {
      ...fixture.expected,
      company: "MIRAIO KAKUU Inc.",
    });

    expect(score.matchedFields).toBe(cardFieldNames.length);
  });

  it("ignores whitespace and line-ending differences", () => {
    const fixture = fixtureByName("two-phones");
    const score = scoreCardTextCase(fixture, {
      ...fixture.expected,
      department: "  技術部  ",
      name: "工作　七郎",
      phone: "03-5555-0104\r\n090-5555-0105",
    });

    expect(score.outcomes.filter((outcome) => !outcome.matched)).toEqual([]);
  });

  it("does not fold kanji variants, so a substituted glyph fails", () => {
    const fixture = fixtureByName("kyujitai-name");
    const score = scoreCardTextCase(fixture, {
      ...fixture.expected,
      name: "高嶋 三子",
    });

    expect(score.matchedFields).toBe(cardFieldNames.length - 1);
  });

  it("treats a blank string as an absent value", () => {
    const fixture = fixtureByName("no-title");
    const score = scoreCardTextCase(fixture, {
      ...fixture.expected,
      title: "",
    });

    expect(score.matchedFields).toBe(cardFieldNames.length);
  });

  it("counts a hallucinated company against the logo-only case", () => {
    const fixture = fixtureByName("logo-only-company");
    const score = scoreCardTextCase(fixture, {
      ...fixture.expected,
      company: "ロゴオンリー株式会社",
    });

    expect(score.matchedFields).toBe(cardFieldNames.length - 1);
  });
});

describe("summarizeCardTextScores", () => {
  it("tallies per field and counts fully correct cases", () => {
    const first = fixtureByName("japanese-standard");
    const second = fixtureByName("no-department");
    const summary = summarizeCardTextScores([
      scoreCardTextCase(first, first.expected),
      scoreCardTextCase(second, { ...second.expected, title: "取締役" }),
    ]);

    expect(summary.cases).toBe(2);
    expect(summary.exactCases).toBe(1);
    expect(summary.perField.title).toEqual({ matched: 1, total: 2 });
    expect(summary.totalFields).toBe(2 * cardFieldNames.length);
    expect(summary.matchedFields).toBe(2 * cardFieldNames.length - 1);
  });

  it("renders a summary that names every field", () => {
    const fixture = fixtureByName("english-only");
    const rendered = formatCardFieldSummary(
      summarizeCardTextScores([scoreCardTextCase(fixture, fixture.expected)]),
    );

    for (const field of cardFieldNames) {
      expect(rendered).toContain(field);
    }
  });
});

describe("normalizeFieldValue", () => {
  it("maps absent and blank input to null", () => {
    expect(normalizeFieldValue(null)).toBeNull();
    expect(normalizeFieldValue(undefined)).toBeNull();
    expect(normalizeFieldValue("   ")).toBeNull();
    expect(normalizeFieldValue("\n　\n")).toBeNull();
  });
});
