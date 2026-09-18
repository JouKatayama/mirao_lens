import {
  evalDimensions,
  type EvalDimension,
  type EvalResult,
  type EvalScore,
} from "./eval-rubric";

/**
 * Measures the judge against people, before anyone measures the product
 * against the judge.
 *
 * An AI judge scoring AI output is not a neutral instrument: when the writer
 * and the scorer share a family, the scorer rewards the writer's habits. A
 * loop driven by an unchecked judge still produces a rising score — it just
 * optimizes toward what the judge likes, and the numbers hide that for as long
 * as anyone is willing to trust them.
 *
 * So the first thing the loop has to report is not the product's score but the
 * judge's agreement with a set of human-scored cases. Until that agreement
 * holds, a change in the product score means nothing, and the thing to fix is
 * the judge's instructions rather than the product.
 *
 * `judge_bias` is the number to read first: positive means the judge is more
 * generous than the people, which is the direction self-agreement pushes.
 */

export type DimensionAgreement = Readonly<{
  dimension: EvalDimension;
  pair_count: number;
  /** Mean |judge − human|, in rubric points. */
  mean_absolute_difference: number;
  exact_match_rate: number;
  /** Fraction of pairs within one rubric point — the practical bar. */
  within_one_rate: number;
  judge_mean: number;
  human_mean: number;
}>;

export type JudgeAgreement = Readonly<{
  case_count: number;
  pair_count: number;
  mean_absolute_difference: number;
  exact_match_rate: number;
  within_one_rate: number;
  /**
   * Pearson correlation across every paired score. Null when it cannot be
   * computed — fewer than two pairs, or one side gave the same score to
   * everything, which is itself worth seeing rather than reporting as zero.
   */
  correlation: number | null;
  /** judge_mean − human_mean. Positive = the judge is the softer marker. */
  judge_bias: number;
  by_dimension: readonly DimensionAgreement[];
  /** Cases present on one side only; they are excluded from every figure. */
  unpaired_case_names: readonly string[];
}>;

/**
 * Bars for trusting the judge, not for shipping the product.
 *
 * Exact agreement on a 1–5 rubric is the wrong thing to demand: two careful
 * people disagree by a point all the time. Landing within one point almost
 * always, with little systematic generosity, is what makes a score movement
 * readable.
 */
export const judgeAgreementThresholds = {
  max_mean_absolute_difference: 0.6,
  min_within_one_rate: 0.9,
  max_absolute_bias: 0.3,
} as const;

export function meetsJudgeAgreement(agreement: JudgeAgreement): boolean {
  return (
    agreement.pair_count > 0 &&
    agreement.mean_absolute_difference <=
      judgeAgreementThresholds.max_mean_absolute_difference &&
    agreement.within_one_rate >= judgeAgreementThresholds.min_within_one_rate &&
    Math.abs(agreement.judge_bias) <= judgeAgreementThresholds.max_absolute_bias
  );
}

type ScorePair = Readonly<{
  dimension: EvalDimension;
  judge: number;
  human: number;
}>;

function toScoreMap(
  scores: readonly EvalScore[],
): ReadonlyMap<EvalDimension, number> {
  const map = new Map<EvalDimension, number>();

  for (const score of scores) {
    // Later duplicates lose: a sheet with the same dimension twice is a
    // transcription slip, not two opinions.
    if (!map.has(score.dimension)) {
      map.set(score.dimension, score.score);
    }
  }

  return map;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function correlation(pairs: readonly ScorePair[]): number | null {
  if (pairs.length < 2) return null;

  const judgeMean = mean(pairs.map((p) => p.judge));
  const humanMean = mean(pairs.map((p) => p.human));

  let covariance = 0;
  let judgeVariance = 0;
  let humanVariance = 0;

  for (const pair of pairs) {
    const judgeDelta = pair.judge - judgeMean;
    const humanDelta = pair.human - humanMean;
    covariance += judgeDelta * humanDelta;
    judgeVariance += judgeDelta * judgeDelta;
    humanVariance += humanDelta * humanDelta;
  }

  if (judgeVariance === 0 || humanVariance === 0) return null;

  return covariance / Math.sqrt(judgeVariance * humanVariance);
}

function summarizeDimension(
  dimension: EvalDimension,
  pairs: readonly ScorePair[],
): DimensionAgreement {
  const differences = pairs.map((pair) => Math.abs(pair.judge - pair.human));

  return {
    dimension,
    pair_count: pairs.length,
    mean_absolute_difference: mean(differences),
    exact_match_rate:
      pairs.length === 0
        ? 0
        : differences.filter((d) => d === 0).length / pairs.length,
    within_one_rate:
      pairs.length === 0
        ? 0
        : differences.filter((d) => d <= 1).length / pairs.length,
    judge_mean: mean(pairs.map((p) => p.judge)),
    human_mean: mean(pairs.map((p) => p.human)),
  };
}

/**
 * Pairs the two sides by case name, then by dimension within a case. A case
 * scored by only one side, or a dimension only one side filled in, contributes
 * nothing rather than being counted as agreement.
 */
export function compareJudgeToHuman(
  judgeResults: readonly EvalResult[],
  humanResults: readonly EvalResult[],
): JudgeAgreement {
  const humanByCase = new Map(
    humanResults.map((result) => [result.case_name, result] as const),
  );
  const judgeByCase = new Map(
    judgeResults.map((result) => [result.case_name, result] as const),
  );

  const pairs: ScorePair[] = [];
  const unpaired: string[] = [];
  let pairedCaseCount = 0;

  for (const judgeResult of judgeResults) {
    const humanResult = humanByCase.get(judgeResult.case_name);

    if (!humanResult) {
      unpaired.push(judgeResult.case_name);
      continue;
    }

    const judgeScores = toScoreMap(judgeResult.scores);
    const humanScores = toScoreMap(humanResult.scores);
    let pairedInCase = 0;

    for (const dimension of evalDimensions) {
      const judge = judgeScores.get(dimension);
      const human = humanScores.get(dimension);

      if (judge === undefined || human === undefined) continue;

      pairs.push({ dimension, judge, human });
      pairedInCase += 1;
    }

    if (pairedInCase > 0) {
      pairedCaseCount += 1;
    } else {
      unpaired.push(judgeResult.case_name);
    }
  }

  for (const humanResult of humanResults) {
    if (!judgeByCase.has(humanResult.case_name)) {
      unpaired.push(humanResult.case_name);
    }
  }

  const differences = pairs.map((pair) => Math.abs(pair.judge - pair.human));

  return {
    case_count: pairedCaseCount,
    pair_count: pairs.length,
    mean_absolute_difference: mean(differences),
    exact_match_rate:
      pairs.length === 0
        ? 0
        : differences.filter((d) => d === 0).length / pairs.length,
    within_one_rate:
      pairs.length === 0
        ? 0
        : differences.filter((d) => d <= 1).length / pairs.length,
    correlation: correlation(pairs),
    judge_bias:
      mean(pairs.map((p) => p.judge)) - mean(pairs.map((p) => p.human)),
    by_dimension: evalDimensions.map((dimension) =>
      summarizeDimension(
        dimension,
        pairs.filter((pair) => pair.dimension === dimension),
      ),
    ),
    unpaired_case_names: unpaired,
  };
}

function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function formatJudgeAgreement(agreement: JudgeAgreement): string {
  const verdict = meetsJudgeAgreement(agreement)
    ? "TRUSTED — product score movements are readable"
    : "NOT TRUSTED — fix the judge before reading product scores";

  const lines = [
    `Judge agreement: ${verdict}`,
    `  cases ${agreement.case_count}, paired scores ${agreement.pair_count}`,
    `  mean |judge-human| ${formatNumber(agreement.mean_absolute_difference)} (bar ≤ ${judgeAgreementThresholds.max_mean_absolute_difference})`,
    `  within 1 point      ${formatNumber(agreement.within_one_rate)} (bar ≥ ${judgeAgreementThresholds.min_within_one_rate})`,
    `  exact match         ${formatNumber(agreement.exact_match_rate)}`,
    `  judge bias          ${agreement.judge_bias >= 0 ? "+" : ""}${formatNumber(agreement.judge_bias)} (bar ≤ ±${judgeAgreementThresholds.max_absolute_bias}; + = judge is softer)`,
    `  correlation         ${agreement.correlation === null ? "n/a" : formatNumber(agreement.correlation)}`,
    "  by dimension:",
  ];

  for (const dimension of agreement.by_dimension) {
    if (dimension.pair_count === 0) {
      lines.push(`    ${dimension.dimension.padEnd(24)} no paired scores`);
      continue;
    }

    lines.push(
      `    ${dimension.dimension.padEnd(24)} mad ${formatNumber(
        dimension.mean_absolute_difference,
      )}  within1 ${formatNumber(dimension.within_one_rate)}  judge ${formatNumber(
        dimension.judge_mean,
      )} vs human ${formatNumber(dimension.human_mean)}`,
    );
  }

  if (agreement.unpaired_case_names.length > 0) {
    lines.push(
      `  excluded (scored by one side only): ${agreement.unpaired_case_names.join(", ")}`,
    );
  }

  return lines.join("\n");
}
