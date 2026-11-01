import type { DataRichness } from "./manufacturing-comparison-fixtures";

/**
 * Blind scoring for the manufacturing A/B/C comparison (ML-030).
 *
 * Reviewers see each case's three questions under the labels X, Y and Z, in an
 * order fixed per case but different across cases, so a reviewer cannot learn
 * that "the long one is always Miraio". The mapping is a pure function of the
 * case name and is applied only when ratings are summarized.
 *
 * Ratings follow the strategy's field metrics as far as a desk review can:
 * would the rep actually ask it (adoption), would it mislead (a hypothesis
 * presented as a fact about the company), and which of the three is best.
 * Time-to-question for ChatGPT by hand can only be measured in the field.
 */

export const comparisonConditions = [
  "generic_chat",
  "current_miraio",
  "playbook",
] as const;

export type ComparisonCondition = (typeof comparisonConditions)[number];

export const blindLabels = ["X", "Y", "Z"] as const;

export type BlindLabel = (typeof blindLabels)[number];

export type BlindAssignment = Readonly<Record<BlindLabel, ComparisonCondition>>;

type ConditionOrder = readonly [
  ComparisonCondition,
  ComparisonCondition,
  ComparisonCondition,
];

const orders: readonly [ConditionOrder, ...ConditionOrder[]] = [
  ["generic_chat", "current_miraio", "playbook"],
  ["generic_chat", "playbook", "current_miraio"],
  ["current_miraio", "generic_chat", "playbook"],
  ["current_miraio", "playbook", "generic_chat"],
  ["playbook", "generic_chat", "current_miraio"],
  ["playbook", "current_miraio", "generic_chat"],
];

// FNV-1a: stable across runtimes, unlike anything seeded from Math.random.
function hashCaseName(caseName: string): number {
  let hash = 0x811c9dc5;

  for (const character of caseName) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash;
}

export function assignBlindLabels(caseName: string): BlindAssignment {
  const [x, y, z] = orders[hashCaseName(caseName) % orders.length] ?? orders[0];

  return { X: x, Y: y, Z: z };
}

// ─── Ratings ─────────────────────────────────────────────────────────────────

export type BlindRating = Readonly<{
  label: BlindLabel;
  /** 1 = best of the three; each case uses 1, 2 and 3 once. */
  rank: 1 | 2 | 3;
  would_use: boolean;
  misleading: boolean;
  notes?: string;
}>;

export type CaseRating = Readonly<{
  case_name: string;
  data_richness: DataRichness;
  ratings: readonly BlindRating[];
}>;

export class ComparisonRatingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComparisonRatingError";
  }
}

function assertCompleteCase(rating: CaseRating): void {
  const labels = rating.ratings.map((entry) => entry.label).sort();
  const ranks = rating.ratings.map((entry) => entry.rank).sort();

  if (labels.join() !== "X,Y,Z" || ranks.join() !== "1,2,3") {
    throw new ComparisonRatingError(
      `${rating.case_name}: rate X, Y and Z once each with ranks 1, 2 and 3.`,
    );
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export type ConditionSummary = Readonly<{
  condition: ComparisonCondition;
  rated: number;
  adoption_rate: number;
  misleading_count: number;
  mean_rank: number;
  first_place_count: number;
}>;

/**
 * - playbook_leads: the playbook is adopted more often than both others, ranks
 *   best on average, and never misleads (the strategy's GO condition, as far as
 *   a desk review can show it).
 * - no_playbook_advantage: rated, but the playbook does not lead.
 * - incomplete: nothing rated yet.
 */
export type ComparisonVerdict =
  "playbook_leads" | "no_playbook_advantage" | "incomplete";

export type ComparisonSummary = Readonly<{
  case_count: number;
  overall: readonly ConditionSummary[];
  by_richness: Readonly<Record<DataRichness, readonly ConditionSummary[]>>;
  verdict: ComparisonVerdict;
}>;

type Unblinded = Readonly<{
  condition: ComparisonCondition;
  data_richness: DataRichness;
  rating: BlindRating;
}>;

function summarizeCondition(
  condition: ComparisonCondition,
  rows: readonly Unblinded[],
): ConditionSummary {
  const own = rows.filter((row) => row.condition === condition);
  const rated = own.length;

  if (rated === 0) {
    return {
      adoption_rate: 0,
      condition,
      first_place_count: 0,
      mean_rank: 0,
      misleading_count: 0,
      rated: 0,
    };
  }

  return {
    adoption_rate: own.filter((row) => row.rating.would_use).length / rated,
    condition,
    first_place_count: own.filter((row) => row.rating.rank === 1).length,
    mean_rank: own.reduce((sum, row) => sum + row.rating.rank, 0) / rated,
    misleading_count: own.filter((row) => row.rating.misleading).length,
    rated,
  };
}

function summarizeConditions(
  rows: readonly Unblinded[],
): readonly ConditionSummary[] {
  return comparisonConditions.map((condition) =>
    summarizeCondition(condition, rows),
  );
}

function decideVerdict(
  overall: readonly ConditionSummary[],
): ComparisonVerdict {
  const playbook = overall.find((entry) => entry.condition === "playbook");
  const others = overall.filter((entry) => entry.condition !== "playbook");

  if (!playbook || playbook.rated === 0) {
    return "incomplete";
  }

  const leads =
    playbook.misleading_count === 0 &&
    others.every(
      (other) =>
        playbook.adoption_rate > other.adoption_rate &&
        playbook.mean_rank < other.mean_rank,
    );

  return leads ? "playbook_leads" : "no_playbook_advantage";
}

export function summarizeManufacturingComparison(
  caseRatings: readonly CaseRating[],
): ComparisonSummary {
  const rows: Unblinded[] = caseRatings.flatMap((caseRating) => {
    assertCompleteCase(caseRating);
    const assignment = assignBlindLabels(caseRating.case_name);

    return caseRating.ratings.map((rating) => ({
      condition: assignment[rating.label],
      data_richness: caseRating.data_richness,
      rating,
    }));
  });

  const overall = summarizeConditions(rows);

  return {
    by_richness: {
      minimal: summarizeConditions(
        rows.filter((row) => row.data_richness === "minimal"),
      ),
      rich: summarizeConditions(
        rows.filter((row) => row.data_richness === "rich"),
      ),
      thin: summarizeConditions(
        rows.filter((row) => row.data_richness === "thin"),
      ),
    },
    case_count: caseRatings.length,
    overall,
    verdict: decideVerdict(overall),
  };
}

// ─── Automatic shape check ───────────────────────────────────────────────────

/**
 * The one property checkable without a reviewer: the product promises a single
 * question the rep can say aloud. More than one question mark, or none, means
 * the output needs editing before use.
 */
export function isSingleQuestion(text: string | null): boolean {
  if (!text) {
    return false;
  }

  const marks = text.match(/[?？]/g)?.length ?? 0;

  return marks === 1 && text.trim().length <= 200;
}

const conditionLabels: Readonly<Record<ComparisonCondition, string>> = {
  current_miraio: "B 現行Miraio",
  generic_chat: "A 汎用ChatGPT",
  playbook: "C Playbook版",
};

function formatRows(rows: readonly ConditionSummary[]): string[] {
  return rows.map(
    (row) =>
      `  ${conditionLabels[row.condition]}: 採用 ${(row.adoption_rate * 100).toFixed(0)}%` +
      ` / 平均順位 ${row.mean_rank.toFixed(2)} / 1位 ${row.first_place_count}` +
      ` / 誤解 ${row.misleading_count} (n=${row.rated})`,
  );
}

export function formatManufacturingComparison(
  summary: ComparisonSummary,
): string {
  return [
    `製造業 A/B/C 比較: ${summary.case_count}ケース / 判定 ${summary.verdict}`,
    ...formatRows(summary.overall),
    ...(["rich", "thin", "minimal"] as const).flatMap((richness) => [
      `情報量 ${richness}:`,
      ...formatRows(summary.by_richness[richness]),
    ]),
  ].join("\n");
}
