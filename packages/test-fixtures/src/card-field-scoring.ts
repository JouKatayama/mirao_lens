import { cardFieldNames, type CardFieldName } from "@miraio/domain";

import type { CardTextFixture } from "./card-text-fixtures";

export type CardFieldOutcome = Readonly<{
  field: CardFieldName;
  expected: string | null;
  actual: string | null;
  matched: boolean;
}>;

export type CardFieldCaseScore = Readonly<{
  caseName: string;
  outcomes: readonly CardFieldOutcome[];
  matchedFields: number;
}>;

export type CardFieldTally = Readonly<{ matched: number; total: number }>;

export type CardFieldSummary = Readonly<{
  cases: number;
  /** Cases where all eight fields matched. */
  exactCases: number;
  matchedFields: number;
  perField: Readonly<Record<CardFieldName, CardFieldTally>>;
  totalFields: number;
}>;

/**
 * Comparison normalization, kept deliberately shallow.
 *
 * Line-ending and surrounding-whitespace differences say nothing about whether
 * a reader assigned a line to the right field, so they are removed. Character
 * width and kanji variants are NOT normalized: preserving the visible spelling
 * of a name is a product requirement, so folding 髙 into 高 here would hide the
 * exact defect this measurement exists to catch.
 */
export function normalizeFieldValue(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return normalized.length > 0 ? normalized : null;
}

function isMatch(
  fixture: CardTextFixture,
  field: CardFieldName,
  actual: string | null,
): boolean {
  const expected = normalizeFieldValue(fixture.expected[field]);

  if (expected === actual) {
    return true;
  }

  const alternatives = fixture.alternatives?.[field] ?? [];

  return alternatives.some(
    (alternative) => normalizeFieldValue(alternative) === actual,
  );
}

export function scoreCardTextCase(
  fixture: CardTextFixture,
  actual: Readonly<Partial<Record<CardFieldName, string | null>>>,
): CardFieldCaseScore {
  const outcomes = cardFieldNames.map((field) => {
    const actualValue = normalizeFieldValue(actual[field]);

    return {
      actual: actualValue,
      expected: normalizeFieldValue(fixture.expected[field]),
      field,
      matched: isMatch(fixture, field, actualValue),
    };
  });

  return {
    caseName: fixture.caseName,
    matchedFields: outcomes.filter((outcome) => outcome.matched).length,
    outcomes,
  };
}

export function summarizeCardTextScores(
  scores: readonly CardFieldCaseScore[],
): CardFieldSummary {
  const perField = Object.fromEntries(
    cardFieldNames.map((field) => [field, { matched: 0, total: 0 }]),
  ) as Record<CardFieldName, { matched: number; total: number }>;

  let matchedFields = 0;
  let exactCases = 0;

  for (const score of scores) {
    for (const outcome of score.outcomes) {
      const tally = perField[outcome.field];
      tally.total += 1;

      if (outcome.matched) {
        tally.matched += 1;
        matchedFields += 1;
      }
    }

    if (score.matchedFields === cardFieldNames.length) {
      exactCases += 1;
    }
  }

  return {
    cases: scores.length,
    exactCases,
    matchedFields,
    perField,
    totalFields: scores.length * cardFieldNames.length,
  };
}

function percentage(matched: number, total: number): string {
  if (total === 0) {
    return "n/a";
  }

  return `${((matched / total) * 100).toFixed(1)}%`;
}

/** Fixed-width table for an eval run's output. */
export function formatCardFieldSummary(summary: CardFieldSummary): string {
  const rows = cardFieldNames.map((field) => {
    const tally = summary.perField[field];

    return `  ${field.padEnd(12)} ${String(tally.matched).padStart(3)}/${String(
      tally.total,
    ).padEnd(3)} ${percentage(tally.matched, tally.total)}`;
  });

  return [
    `cases: ${summary.cases}  exact: ${summary.exactCases}  fields: ${
      summary.matchedFields
    }/${summary.totalFields} (${percentage(
      summary.matchedFields,
      summary.totalFields,
    )})`,
    ...rows,
  ].join("\n");
}
