// Eight-dimension evaluation rubric from the product spec (Section 15).
// Scores are 1–5; mean across dimensions gives the case overall score.

export const evalDimensions = [
  "extraction_accuracy",
  "grounding",
  "personalization",
  "business_relevance",
  "conversation_usefulness",
  "conciseness",
  "uncertainty_handling",
  "safety",
] as const;

export type EvalDimension = (typeof evalDimensions)[number];

export type EvalScore = Readonly<{
  dimension: EvalDimension;
  // 1 = unacceptable, 3 = acceptable, 5 = excellent
  score: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}>;

export type EvalResult = Readonly<{
  case_name: string;
  scores: readonly EvalScore[];
  overall: number;
}>;

export type EvalSummary = Readonly<{
  case_count: number;
  dimension_means: Readonly<Record<EvalDimension, number>>;
  overall_mean: number;
}>;

export function computeOverall(scores: readonly EvalScore[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
}

export function summarizeEvalResults(
  results: readonly EvalResult[],
): EvalSummary {
  if (results.length === 0) {
    const zero = Object.fromEntries(
      evalDimensions.map((d) => [d, 0]),
    ) as Record<EvalDimension, number>;
    return { case_count: 0, dimension_means: zero, overall_mean: 0 };
  }

  const sums = Object.fromEntries(
    evalDimensions.map((d) => [d, { count: 0, total: 0 }]),
  ) as Record<EvalDimension, { count: number; total: number }>;

  for (const result of results) {
    for (const score of result.scores) {
      sums[score.dimension].total += score.score;
      sums[score.dimension].count += 1;
    }
  }

  const dimension_means = Object.fromEntries(
    evalDimensions.map((d) => [
      d,
      sums[d].count > 0 ? sums[d].total / sums[d].count : 0,
    ]),
  ) as Record<EvalDimension, number>;

  const overall_mean =
    results.reduce((sum, r) => sum + r.overall, 0) / results.length;

  return { case_count: results.length, dimension_means, overall_mean };
}
