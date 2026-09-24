import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  jevShadowFixtures,
  toJevShadowMutualValueInput,
} from "@miraio/test-fixtures";
import { describe, it } from "vitest";

import { buildFlashBriefShadowEvaluationRequest } from "./flash-brief-shadow-evaluation";
import { buildIdentityStatusShadowEvaluationRequest } from "./identity-status-shadow-evaluation";
import {
  assertJevHumanTemplateMatches,
  compareJevHumanReviews,
  compareJevShadowToHuman,
  makeJevHumanTemplate,
  type HumanRequest,
  type HumanTemplate,
  type JevHumanReview,
} from "./jev-shadow-human-review";
import type { JevShadowReport } from "./jev-shadow-report";
import { buildMutualValueClaimShadowEvaluationRequest } from "./mutual-value-claim-shadow-evaluation";
import { buildPotentialScoreShadowEvaluationRequest } from "./potential-score-shadow-evaluation";
import { buildSayThisShadowEvaluationRequest } from "./say-this-shadow-evaluation";

/** Offline only. No provider, route, threshold, or production index export. */
const runReview = process.env.MIRAIO_RUN_JEV_HUMAN_REVIEW === "1";
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const reportPath = resolve(
  repositoryRoot,
  process.env.MIRAIO_JEV_REPORT ?? "evals/reports/jev-shadow-latest.json",
);
const templatePath = resolve(
  repositoryRoot,
  "evals/reports/jev-shadow-human-template.json",
);
const anchorPath = resolve(
  repositoryRoot,
  process.env.MIRAIO_JEV_HUMAN_ANCHORS ??
    "evals/anchors/jev-shadow-human-labels.json",
);
const reviewPath = resolve(
  repositoryRoot,
  "evals/reports/jev-shadow-human-review.json",
);

function requests(): HumanRequest[] {
  return jevShadowFixtures.flatMap(
    (fixture) =>
      [
        {
          case_name: fixture.caseName,
          evaluation: "flash_brief",
          request: buildFlashBriefShadowEvaluationRequest({
            input: fixture.input,
            brief: fixture.brief,
          }),
        },
        {
          case_name: fixture.caseName,
          evaluation: "say_this",
          request: buildSayThisShadowEvaluationRequest({
            input: fixture.input,
            candidates: fixture.brief.say_this,
          }),
        },
        {
          case_name: fixture.caseName,
          evaluation: "potential_score",
          request: buildPotentialScoreShadowEvaluationRequest({
            input: fixture.input,
            brief: fixture.brief,
          }),
        },
        {
          case_name: fixture.caseName,
          evaluation: "identity_status",
          request: buildIdentityStatusShadowEvaluationRequest({
            input: fixture.input,
            brief: fixture.brief,
          }),
        },
        {
          case_name: fixture.caseName,
          evaluation: "mutual_value_claims",
          request: buildMutualValueClaimShadowEvaluationRequest({
            input: toJevShadowMutualValueInput(fixture),
            mutualValue: fixture.mutualValue,
          }),
        },
      ] satisfies HumanRequest[],
  );
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe.runIf(runReview)("Jev shadow human review", () => {
  it("generates a blind human sheet and compares only completed labels", () => {
    if (!existsSync(reportPath))
      throw new Error(`Jev shadow report not found: ${reportPath}`);
    const source = JSON.parse(
      readFileSync(reportPath, "utf8"),
    ) as JevShadowReport;
    if (
      source.schema_version !== 1 ||
      source.provider !== "typesafe/jev" ||
      !Array.isArray(source.runs)
    ) {
      throw new Error("Invalid Jev shadow report.");
    }
    const reference = makeJevHumanTemplate(requests());
    writeJson(templatePath, reference);

    // Never use a Jev answer as a human label. The template contains only the
    // exact shadow state and questions; every human_answer starts as null.
    if (!existsSync(anchorPath)) {
      console.info(
        `Human labels not found. Unscored template: ${templatePath}\nCopy to ${anchorPath}, then fill human_answer without reading Jev outputs.`,
      );
      return;
    }

    const anchors = JSON.parse(
      readFileSync(anchorPath, "utf8"),
    ) as HumanTemplate;
    assertJevHumanTemplateMatches(reference, anchors);
    const review = compareJevShadowToHuman(source.runs, anchors);
    const previous = existsSync(reviewPath)
      ? (JSON.parse(readFileSync(reviewPath, "utf8")) as {
          review?: JevHumanReview;
        })
      : null;
    const output = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source_report_generated_at: source.generated_at,
      review,
      comparison_to_previous: previous?.review
        ? compareJevHumanReviews(review, previous.review)
        : null,
    };
    writeJson(reviewPath, output);
    console.info(
      `Human review: ${review.coverage.labeled}/${review.coverage.total} labeled questions. Report: ${reviewPath}`,
    );
  });
});
