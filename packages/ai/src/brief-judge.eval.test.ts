import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareJudgeToHuman,
  computeOverall,
  evalDimensions,
  flashBriefGoldenCases,
  formatJudgeAgreement,
  personaFlashBriefCases,
  runFlashBriefAssertions,
  summarizeEvalResults,
  type EvalDimension,
  type EvalResult,
  type EvalScore,
  type EvalSummary,
  type FlashBriefCase,
} from "@miraio/test-fixtures";
import { describe, expect, it } from "vitest";

import { OpenAIBriefJudge, type JudgeWeakness } from "./brief-judge";
import { OpenAIFlashBriefGenerator } from "./flash-brief";
import { isReasoningEffort } from "./provider-client";

/**
 * One turn of the improvement loop: generate, judge, report, compare.
 *
 *   MIRAIO_RUN_BRIEF_JUDGE_EVAL=1 \
 *   AI_FLASH_BRIEF_MODEL=<model> \
 *   AI_BRIEF_JUDGE_MODEL=<a different model> \
 *   pnpm --filter @miraio/ai exec vitest run src/brief-judge.eval.test.ts
 *
 * Opt-in and billed to whoever runs it, like the card-field eval beside it.
 * It asserts no quality threshold: a pass/fail line drawn before anyone knows
 * what these models score would be invented, and the output — the dimension
 * means, the weaknesses, and the movement since the last run — is the point.
 *
 * It does assert two things, because both are failures of the measurement
 * rather than of the product: the deterministic safety and structure checks,
 * which need no judge to be right, and the judge's agreement with human
 * scoring when an anchor file is present.
 *
 * Read the output in this order:
 *   1. judge agreement — is the instrument trustworthy at all?
 *   2. regression against the previous run — did this change break something?
 *   3. dimension means and weaknesses — where to aim the next change.
 */
const runEval = process.env.MIRAIO_RUN_BRIEF_JUDGE_EVAL === "1";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const reportPath = resolve(
  repositoryRoot,
  process.env.MIRAIO_EVAL_REPORT ?? "evals/reports/latest.json",
);

const anchorPath = resolve(
  repositoryRoot,
  process.env.MIRAIO_EVAL_ANCHORS ?? "evals/anchors/human-scores.json",
);

const perCaseTimeoutMilliseconds = Number(
  process.env.AI_BRIEF_JUDGE_TIMEOUT_MS ?? 60_000,
);

type EvalReport = Readonly<{
  generated_at: string;
  brief_model: string;
  judge_model: string;
  case_set: string;
  summary: EvalSummary;
  results: readonly EvalResult[];
  assertion_failures: readonly string[];
  weaknesses: readonly (JudgeWeakness & { case_name: string })[];
}>;

function selectCases(): { label: string; cases: readonly FlashBriefCase[] } {
  switch (process.env.MIRAIO_EVAL_CASES ?? "persona") {
    case "golden":
      return { label: "golden", cases: flashBriefGoldenCases };
    case "all":
      return {
        label: "all",
        cases: [...personaFlashBriefCases, ...flashBriefGoldenCases],
      };
    default:
      return { label: "persona", cases: personaFlashBriefCases };
  }
}

function readReport(path: string): EvalReport | null {
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, "utf8")) as EvalReport;
  } catch {
    // A half-written or hand-edited baseline should not fail the run it is
    // only meant to contextualize.
    return null;
  }
}

function writeReport(path: string, report: EvalReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function formatDelta(current: number, previous: number | undefined): string {
  if (previous === undefined) return "";

  const delta = current - previous;

  if (Math.abs(delta) < 0.005) return "   (=)";

  // A drop is the thing this line exists to surface, so it gets the marker.
  return `   ${delta > 0 ? "+" : "▼ "}${delta.toFixed(2)}`;
}

function formatRegression(
  summary: EvalSummary,
  previous: EvalReport | null,
): string {
  const lines = [
    previous
      ? `Compared with ${previous.generated_at} (${previous.case_set}, brief ${previous.brief_model}, judge ${previous.judge_model})`
      : "No previous report — this run becomes the baseline.",
    `  overall${" ".repeat(18)}${summary.overall_mean.toFixed(2)}${formatDelta(
      summary.overall_mean,
      previous?.summary.overall_mean,
    )}`,
  ];

  for (const dimension of evalDimensions) {
    const current = summary.dimension_means[dimension];
    lines.push(
      `  ${dimension.padEnd(24)}${current.toFixed(2)}${formatDelta(
        current,
        previous?.summary.dimension_means[dimension],
      )}`,
    );
  }

  return lines.join("\n");
}

describe.runIf(runEval)("flash brief judge eval", () => {
  it(
    "generates, judges and reports every case",
    async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      const briefModel = process.env.AI_FLASH_BRIEF_MODEL;
      const judgeModel = process.env.AI_BRIEF_JUDGE_MODEL;

      if (!apiKey || !briefModel || !judgeModel) {
        throw new Error(
          "OPENAI_API_KEY, AI_FLASH_BRIEF_MODEL and AI_BRIEF_JUDGE_MODEL are required for this eval.",
        );
      }

      const baseUrl = process.env.AI_PROVIDER_BASE_URL;
      const briefEffort = process.env.AI_FLASH_BRIEF_EFFORT;
      const judgeEffort = process.env.AI_BRIEF_JUDGE_EFFORT;

      const generator = new OpenAIFlashBriefGenerator({
        apiKey,
        baseUrl,
        effort:
          briefEffort && isReasoningEffort(briefEffort)
            ? briefEffort
            : undefined,
        model: briefModel,
      });

      const judge = new OpenAIBriefJudge({
        apiKey,
        baseUrl,
        effort:
          judgeEffort && isReasoningEffort(judgeEffort)
            ? judgeEffort
            : undefined,
        model: judgeModel,
        timeoutMilliseconds: perCaseTimeoutMilliseconds,
      });

      const { cases, label } = selectCases();
      const results: EvalResult[] = [];
      const assertionFailures: string[] = [];
      const weaknesses: (JudgeWeakness & { case_name: string })[] = [];

      for (const evalCase of cases) {
        // The brief generator runs on its production timeout, because that is
        // the thing being measured. A locally served model that cannot answer
        // inside it fails the run rather than being quietly given more room.
        const brief = await generator.generate(evalCase.input);

        for (const assertion of runFlashBriefAssertions(brief, evalCase)) {
          if (assertion.passed) continue;

          assertionFailures.push(
            `  ${evalCase.caseName}.${assertion.name}: ${assertion.message ?? "failed"}`,
          );
        }

        const judgement = await judge.judge({ brief, input: evalCase.input });

        const scores = judgement.scores.map((score): EvalScore => ({
          dimension: score.dimension as EvalDimension,
          score: score.score as 1 | 2 | 3 | 4 | 5,
          notes: score.reason,
        }));

        results.push({
          case_name: evalCase.caseName,
          scores,
          overall: computeOverall(scores),
        });

        for (const weakness of judgement.weaknesses) {
          weaknesses.push({ ...weakness, case_name: evalCase.caseName });
        }
      }

      const summary = summarizeEvalResults(results);
      const previous = readReport(reportPath);

      const report: EvalReport = {
        assertion_failures: assertionFailures,
        brief_model: briefModel,
        case_set: label,
        generated_at: new Date().toISOString(),
        judge_model: judgeModel,
        results,
        summary,
        weaknesses,
      };

      const anchors = readAnchors(anchorPath);
      const agreement = anchors ? compareJudgeToHuman(results, anchors) : null;

      const lines = [
        "",
        `Flash Brief judge eval — ${results.length} cases (${label})`,
        `  brief model ${briefModel}${briefEffort ? ` (effort ${briefEffort})` : ""}`,
        `  judge model ${judgeModel}${judgeEffort ? ` (effort ${judgeEffort})` : ""}`,
        "",
        agreement
          ? formatJudgeAgreement(agreement)
          : `Judge agreement: no anchor file at ${anchorPath} — scores below are unverified.\n  Until people have scored these cases, a score movement is not evidence.`,
        "",
        formatRegression(summary, previous),
        "",
        `Weaknesses reported: ${weaknesses.length}`,
        ...formatWeaknessCounts(weaknesses),
      ];

      if (assertionFailures.length > 0) {
        lines.push(
          "",
          "Deterministic assertion failures:",
          ...assertionFailures,
        );
      }

      console.info(lines.join("\n"));

      writeReport(reportPath, report);

      console.info(`\nReport written to ${reportPath}\n`);

      // Structure and safety are not opinions, so they fail the run.
      expect(assertionFailures).toEqual([]);

      // An untrusted judge invalidates every number above it. Only assert this
      // when people have actually scored the cases.
      if (agreement) {
        expect(agreement.within_one_rate).toBeGreaterThanOrEqual(0.9);
      }
    },
    // Every case is two provider round trips, and the whole set runs inside
    // this one test, so the budget has to outlast all of them together.
    (perCaseTimeoutMilliseconds + 30_000) * selectCases().cases.length + 60_000,
  );
});

function formatWeaknessCounts(
  weaknesses: readonly (JudgeWeakness & { case_name: string })[],
): readonly string[] {
  if (weaknesses.length === 0) return ["  (none)"];

  const counts = new Map<string, number>();

  for (const weakness of weaknesses) {
    counts.set(weakness.dimension, (counts.get(weakness.dimension) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([dimension, count]) => `  ${dimension.padEnd(24)} ${count}`);
}

/**
 * Anchor scores are the same `EvalResult` shape the report writes, so the
 * sheet people fill in is a copy of a report with the scores replaced by their
 * own. A missing file is the normal state before Phase 0 is done.
 */
function readAnchors(path: string): readonly EvalResult[] | null {
  if (!existsSync(path)) return null;

  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;

  if (Array.isArray(parsed)) return parsed as readonly EvalResult[];

  const results = (parsed as { results?: unknown }).results;

  return Array.isArray(results) ? (results as readonly EvalResult[]) : null;
}
