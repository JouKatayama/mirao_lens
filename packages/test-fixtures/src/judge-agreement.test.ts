import { describe, expect, it } from "vitest";

import {
  compareJudgeToHuman,
  formatJudgeAgreement,
  meetsJudgeAgreement,
} from "./judge-agreement";
import {
  computeOverall,
  evalDimensions,
  type EvalResult,
  type EvalScore,
} from "./eval-rubric";

function resultFor(
  caseName: string,
  score: 1 | 2 | 3 | 4 | 5,
  overrides: Partial<
    Record<(typeof evalDimensions)[number], 1 | 2 | 3 | 4 | 5>
  > = {},
): EvalResult {
  const scores = evalDimensions.map((dimension): EvalScore => ({
    dimension,
    score: overrides[dimension] ?? score,
  }));

  return { case_name: caseName, scores, overall: computeOverall(scores) };
}

describe("judge agreement", () => {
  it("reports perfect agreement when both sides score identically", () => {
    const results = [resultFor("a", 4), resultFor("b", 3)];
    const agreement = compareJudgeToHuman(results, results);

    expect(agreement.case_count).toBe(2);
    expect(agreement.pair_count).toBe(evalDimensions.length * 2);
    expect(agreement.mean_absolute_difference).toBe(0);
    expect(agreement.exact_match_rate).toBe(1);
    expect(agreement.within_one_rate).toBe(1);
    expect(agreement.judge_bias).toBe(0);
    expect(meetsJudgeAgreement(agreement)).toBe(true);
  });

  it("surfaces a soft judge as positive bias", () => {
    const agreement = compareJudgeToHuman(
      [resultFor("a", 5), resultFor("b", 5)],
      [resultFor("a", 3), resultFor("b", 3)],
    );

    expect(agreement.judge_bias).toBe(2);
    expect(agreement.mean_absolute_difference).toBe(2);
    expect(agreement.within_one_rate).toBe(0);
    expect(meetsJudgeAgreement(agreement)).toBe(false);
  });

  it("fails a judge that is close on average but systematically generous", () => {
    // Every score off by exactly one point in the same direction: within-one
    // passes, but the bias bar is what catches a judge rewarding its own habits.
    const agreement = compareJudgeToHuman(
      [resultFor("a", 4), resultFor("b", 5)],
      [resultFor("a", 3), resultFor("b", 4)],
    );

    expect(agreement.within_one_rate).toBe(1);
    expect(agreement.judge_bias).toBe(1);
    expect(meetsJudgeAgreement(agreement)).toBe(false);
  });

  it("excludes cases only one side scored", () => {
    const agreement = compareJudgeToHuman(
      [resultFor("a", 4), resultFor("judge-only", 1)],
      [resultFor("a", 4), resultFor("human-only", 5)],
    );

    expect(agreement.case_count).toBe(1);
    expect(agreement.pair_count).toBe(evalDimensions.length);
    expect(agreement.mean_absolute_difference).toBe(0);
    expect(agreement.unpaired_case_names).toEqual(["judge-only", "human-only"]);
  });

  it("pairs only the dimensions both sides filled in", () => {
    const judge: EvalResult = {
      case_name: "a",
      scores: [
        { dimension: "grounding", score: 4 },
        { dimension: "safety", score: 5 },
      ],
      overall: 4.5,
    };
    const human: EvalResult = {
      case_name: "a",
      scores: [{ dimension: "grounding", score: 2 }],
      overall: 2,
    };

    const agreement = compareJudgeToHuman([judge], [human]);

    expect(agreement.pair_count).toBe(1);
    expect(agreement.mean_absolute_difference).toBe(2);

    const grounding = agreement.by_dimension.find(
      (d) => d.dimension === "grounding",
    );
    const safety = agreement.by_dimension.find((d) => d.dimension === "safety");

    expect(grounding?.pair_count).toBe(1);
    expect(safety?.pair_count).toBe(0);
  });

  it("reports no correlation when one side never varies", () => {
    const agreement = compareJudgeToHuman(
      [resultFor("a", 4), resultFor("b", 2)],
      [resultFor("a", 3), resultFor("b", 3)],
    );

    expect(agreement.correlation).toBeNull();
  });

  it("computes correlation across paired scores", () => {
    const agreement = compareJudgeToHuman(
      [resultFor("a", 5), resultFor("b", 2)],
      [resultFor("a", 4), resultFor("b", 1)],
    );

    expect(agreement.correlation).toBeCloseTo(1, 10);
  });

  it("treats an empty comparison as untrusted rather than perfect", () => {
    const agreement = compareJudgeToHuman([], []);

    expect(agreement.pair_count).toBe(0);
    expect(agreement.mean_absolute_difference).toBe(0);
    expect(meetsJudgeAgreement(agreement)).toBe(false);
  });

  it("formats a verdict a reader can act on", () => {
    const results = [resultFor("a", 4), resultFor("b", 3)];
    const text = formatJudgeAgreement(compareJudgeToHuman(results, results));

    expect(text).toContain("TRUSTED");
    expect(text).toContain("grounding");
  });
});
