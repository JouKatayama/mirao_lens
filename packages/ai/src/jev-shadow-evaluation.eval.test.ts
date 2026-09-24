import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  jevShadowFixtures,
  toJevShadowMutualValueInput,
} from "@miraio/test-fixtures";
import { describe, it } from "vitest";

import {
  expectedDecisionScore,
  type DecisionEvaluationRequest,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
} from "./decision-evaluator";
import { evaluateFlashBriefInShadow } from "./flash-brief-shadow-evaluation";
import { evaluateIdentityStatusInShadow } from "./identity-status-shadow-evaluation";
import {
  compareJevShadowReports,
  parseJevShadowRepeats,
  summarizeJevShadowRuns,
  type JevShadowAnswer,
  type JevShadowEvaluationName,
  type JevShadowEvaluationRun,
  type JevShadowReport,
  type JevShadowRun,
} from "./jev-shadow-report";
import { evaluateMutualValueClaimsInShadow } from "./mutual-value-claim-shadow-evaluation";
import { evaluatePotentialScoreInShadow } from "./potential-score-shadow-evaluation";
import { JevDecisionEvaluator } from "./providers/jev-decision-evaluator";
import { evaluateSayThisInShadow } from "./say-this-shadow-evaluation";

/**
 * Runs every Jev shadow evaluation over deterministic synthetic fixtures.
 *
 *   MIRAIO_RUN_JEV_SHADOW=1 \
 *   TYPESAFE_API_KEY=<key> \
 *   MIRAIO_JEV_REPEATS=5 \
 *   pnpm --filter @miraio/ai exec vitest run \
 *     src/jev-shadow-evaluation.eval.test.ts --disable-console-intercept
 *
 * The flag and key are both required. With either absent this file registers
 * no runnable test, so ordinary `pnpm test` cannot call Jev accidentally.
 * Inputs and generated prose are checked-in synthetic fixtures; this runner
 * never constructs or calls an OpenAI client.
 *
 * This is measurement, not a gate. It has no quality assertion or threshold,
 * writes only under the gitignored eval report directory by default, is not
 * exported from `index.ts`, and is not imported by a route.
 */

const runShadow =
  process.env.MIRAIO_RUN_JEV_SHADOW === "1" &&
  Boolean(process.env.TYPESAFE_API_KEY?.trim());

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const reportPath = resolve(
  repositoryRoot,
  process.env.MIRAIO_JEV_REPORT ??
    "evals/reports/jev-shadow-latest.json",
);

class RecordingEvaluator implements DecisionEvaluator {
  private recorded:
    | Readonly<{
        request: DecisionEvaluationRequest;
        result: DecisionEvaluationResult;
      }>
    | undefined;

  constructor(private readonly delegate: DecisionEvaluator) {}

  async evaluate(
    request: DecisionEvaluationRequest,
  ): Promise<DecisionEvaluationResult> {
    if (this.recorded) {
      throw new Error("A shadow evaluation made more than one Jev request.");
    }

    const result = await this.delegate.evaluate(request);
    this.recorded = { request, result };
    return result;
  }

  toAnswers(): readonly JevShadowAnswer[] {
    if (!this.recorded) {
      throw new Error("A shadow evaluation made no Jev request.");
    }

    return this.recorded.request.questions.map((question, index) => {
      const answer = this.recorded?.result.answers[index];

      if (!answer || answer.id !== question.id || answer.type !== question.type) {
        throw new Error("Recorded Jev answer does not match its question.");
      }

      if (question.type === "choice" && answer.type === "choice") {
        return {
          confidence: answer.confidence,
          probabilities: answer.probabilities,
          question_id: question.id,
          selected: answer.choice,
          type: "choice",
        };
      }

      if (question.type === "score" && answer.type === "score") {
        return {
          confidence: answer.confidence,
          expected_score: expectedDecisionScore(question, answer),
          modal_level: answer.score,
          probabilities: answer.probabilities,
          question_id: question.id,
          type: "score",
        };
      }

      if (question.type === "boolean" && answer.type === "boolean") {
        return {
          probability: answer.probability,
          question_id: question.id,
          type: "boolean",
        };
      }

      throw new Error("Recorded Jev answer has an unsupported shape.");
    });
  }
}

async function recordEvaluation(
  evaluator: DecisionEvaluator,
  evaluation: JevShadowEvaluationName,
  run: (recording: DecisionEvaluator) => Promise<unknown>,
): Promise<JevShadowEvaluationRun> {
  const recording = new RecordingEvaluator(evaluator);
  const startedAt = performance.now();

  await run(recording);

  return {
    answers: recording.toAnswers(),
    evaluation,
    latency_ms: performance.now() - startedAt,
  };
}

function readReport(path: string): JevShadowReport | null {
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, "utf8")) as JevShadowReport;
  } catch {
    // A partial or hand-edited report should not prevent the next measurement.
    return null;
  }
}

function writeReport(path: string, report: JevShadowReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function formatReport(report: JevShadowReport): string {
  const { summary } = report;
  const comparison = report.comparison_to_previous;

  return [
    "",
    `Jev shadow evaluation — ${report.case_count} cases × ${report.repeats} repeats`,
    `  model ${report.model}`,
    `  confidence min=${summary.confidence_overall.min.toFixed(3)} ` +
      `max=${summary.confidence_overall.max.toFixed(3)} ` +
      `mean=${summary.confidence_overall.mean.toFixed(3)} ` +
      `span=${summary.confidence_overall.span.toFixed(3)}`,
    `  modal/expected disagreements ` +
      `${summary.modal_expected_disagreement.count}/` +
      `${summary.modal_expected_disagreement.total} ` +
      `(definition: ${summary.modal_expected_disagreement.definition})`,
    `  run latency p50=${summary.run_latency_ms.p50.toFixed(0)}ms ` +
      `p95=${summary.run_latency_ms.p95.toFixed(0)}ms`,
    comparison
      ? `  previous ${comparison.previous_generated_at}: ` +
        `confidence mean ${comparison.confidence_mean_delta >= 0 ? "+" : ""}` +
        `${comparison.confidence_mean_delta.toFixed(3)}, ` +
        `run p95 ${comparison.run_latency_p95_ms_delta >= 0 ? "+" : ""}` +
        `${comparison.run_latency_p95_ms_delta.toFixed(0)}ms`
      : "  no previous report — this run becomes the baseline",
    `\nReport written to ${reportPath}\n`,
  ].join("\n");
}

describe.runIf(runShadow)("Jev shadow evaluation", () => {
  it(
    "measures all five shadow evaluations over every synthetic case",
    async () => {
      const repeats = parseJevShadowRepeats(
        process.env.MIRAIO_JEV_REPEATS,
      );
      const model = process.env.AI_DECISION_MODEL?.trim() || "jev-latest";
      const evaluator = new JevDecisionEvaluator({
        apiKey: process.env.TYPESAFE_API_KEY,
        model,
      });
      const runs: JevShadowRun[] = [];

      for (const fixture of jevShadowFixtures) {
        for (let repeat = 1; repeat <= repeats; repeat += 1) {
          const startedAt = performance.now();
          const evaluations: JevShadowEvaluationRun[] = [];

          evaluations.push(
            await recordEvaluation(evaluator, "flash_brief", (recording) =>
              evaluateFlashBriefInShadow(recording, {
                brief: fixture.brief,
                input: fixture.input,
              }),
            ),
          );
          evaluations.push(
            await recordEvaluation(evaluator, "say_this", (recording) =>
              evaluateSayThisInShadow(recording, {
                candidates: fixture.brief.say_this,
                input: fixture.input,
              }),
            ),
          );
          evaluations.push(
            await recordEvaluation(evaluator, "potential_score", (recording) =>
              evaluatePotentialScoreInShadow(recording, {
                brief: fixture.brief,
                input: fixture.input,
              }),
            ),
          );
          evaluations.push(
            await recordEvaluation(evaluator, "identity_status", (recording) =>
              evaluateIdentityStatusInShadow(recording, {
                brief: fixture.brief,
                input: fixture.input,
              }),
            ),
          );
          evaluations.push(
            await recordEvaluation(
              evaluator,
              "mutual_value_claims",
              (recording) =>
                evaluateMutualValueClaimsInShadow(recording, {
                  input: toJevShadowMutualValueInput(fixture),
                  mutualValue: fixture.mutualValue,
                }),
            ),
          );

          runs.push({
            case_name: fixture.caseName,
            evaluations,
            repeat,
            total_latency_ms: performance.now() - startedAt,
          });
        }
      }

      const previous = readReport(reportPath);
      const summary = summarizeJevShadowRuns(runs);
      const report: JevShadowReport = {
        case_count: jevShadowFixtures.length,
        comparison_to_previous: compareJevShadowReports(summary, previous),
        generated_at: new Date().toISOString(),
        model,
        provider: "typesafe/jev",
        repeats,
        runs,
        schema_version: 1,
        summary,
      };

      writeReport(reportPath, report);
      console.info(formatReport(report));
    },
    // Five provider calls per case and repeat, each with the adapter's 5s bound.
    parseJevShadowRepeats(process.env.MIRAIO_JEV_REPEATS) *
      jevShadowFixtures.length *
      5 *
      6_000 +
      30_000,
  );
});
