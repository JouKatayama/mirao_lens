import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  attachOpportunityPlaybook,
  type FlashBriefInput,
} from "@miraio/domain";
import {
  assignBlindLabels,
  blindLabels,
  formatManufacturingComparison,
  isSingleQuestion,
  manufacturingComparisonCases,
  summarizeManufacturingComparison,
  type BlindLabel,
  type CaseRating,
  type ComparisonCondition,
  type ManufacturingComparisonCase,
} from "@miraio/test-fixtures";
import { describe, expect, it } from "vitest";

import { OpenAIFlashBriefGenerator } from "./flash-brief";
import { manufacturingOpportunityPlaybook } from "./knowledge/manufacturing-playbook";
import { createOpenAIClient } from "./provider-client";

/**
 * Manufacturing A/B/C comparison (ML-030), opt-in and billed to whoever runs it.
 *
 *   A generic_chat    the prompt a rep would type into ChatGPT by hand
 *   B current_miraio  the shipped Flash Brief
 *   C playbook        the Flash Brief with the Opportunity Playbook attached
 *
 * All three use one model and one set of inputs, so only the method differs.
 *
 * 1. Generate (writes blind questions and a measurement file):
 *
 *      MIRAIO_RUN_MANUFACTURING_COMPARISON=1 \
 *      AI_COMPARISON_MODEL=<model> \
 *      pnpm --filter @miraio/ai exec vitest run src/manufacturing-comparison.eval.test.ts
 *
 * 2. Reviewers fill evals/reports/manufacturing-comparison-ratings.json without
 *    opening the measurement file, which names the conditions.
 *
 * 3. Summarize:
 *
 *      MIRAIO_RUN_MANUFACTURING_COMPARISON_SUMMARY=1 \
 *      pnpm --filter @miraio/ai exec vitest run src/manufacturing-comparison.eval.test.ts
 *
 * See evals/manufacturing-comparison/README.md.
 */

const runGenerate = process.env.MIRAIO_RUN_MANUFACTURING_COMPARISON === "1";
const runSummary =
  process.env.MIRAIO_RUN_MANUFACTURING_COMPARISON_SUMMARY === "1";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const reportDirectory = resolve(repositoryRoot, "evals/reports");
const blindPath = resolve(
  reportDirectory,
  "manufacturing-comparison-latest.json",
);
const measurementPath = resolve(
  reportDirectory,
  "manufacturing-comparison-measurements.json",
);
const ratingsPath = resolve(
  reportDirectory,
  "manufacturing-comparison-ratings.json",
);

const perCallTimeoutMilliseconds = Number(
  process.env.AI_COMPARISON_TIMEOUT_MS ?? 60_000,
);

type ConditionResult = Readonly<{
  question: string | null;
  latency_ms: number;
  error: string | null;
  playbook_ids: readonly string[];
}>;

/**
 * What a rep plausibly types into ChatGPT with the same facts Miraio receives:
 * no schema, no rules about facts and hypotheses, one request for a question.
 */
function buildGenericChatPrompt(input: FlashBriefInput): string {
  const { card, personal_context: seller } = input;
  const offers = seller.items
    .filter((item) => item.type === "offer" || item.type === "expertise")
    .map((item) => item.text)
    .join("、");
  const counterpart = [card.company, card.department, card.title]
    .filter(Boolean)
    .join(" ");
  const company = input.company_context;
  const companyLine = company?.company_description
    ? `相手の会社について分かっていること：${company.company_description}`
    : "";

  return [
    `私は${seller.current_company ?? "自社"}の${seller.current_role ?? "営業"}で、${offers}をしています。`,
    `展示会で名刺交換した相手は「${counterpart}」です。`,
    companyLine,
    "初対面の会話で、自社の商材につなげるために聞くべき質問を1つだけ考えてください。質問文だけを答えてください。",
  ]
    .filter(Boolean)
    .join("\n");
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function timed(
  run: () => Promise<string | null>,
): Promise<Omit<ConditionResult, "playbook_ids">> {
  const startedAt = performance.now();

  try {
    const question = (await run())?.trim() || null;
    return {
      error: null,
      latency_ms: Math.round(performance.now() - startedAt),
      question,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.name : "unknown",
      latency_ms: Math.round(performance.now() - startedAt),
      question: null,
    };
  }
}

describe.runIf(runGenerate)("manufacturing A/B/C comparison: generate", () => {
  it(
    "writes blind questions for every case and condition",
    async () => {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      const model =
        process.env.AI_COMPARISON_MODEL?.trim() ||
        process.env.AI_FLASH_BRIEF_MODEL?.trim();
      const baseUrl = process.env.AI_PROVIDER_BASE_URL?.trim() || undefined;

      if (!apiKey || !model) {
        throw new Error(
          "OPENAI_API_KEY and AI_COMPARISON_MODEL are required for this eval.",
        );
      }

      const client = createOpenAIClient(
        apiKey,
        perCallTimeoutMilliseconds,
        baseUrl,
      );
      const brief = new OpenAIFlashBriefGenerator({ apiKey, baseUrl, model });

      const runCase = async (
        entry: ManufacturingComparisonCase,
      ): Promise<Record<ComparisonCondition, ConditionResult>> => {
        const withPlaybook = attachOpportunityPlaybook(
          entry.input,
          manufacturingOpportunityPlaybook,
        );

        const genericChat = await timed(async () => {
          const response = await client.responses.create({
            input: buildGenericChatPrompt(entry.input),
            model,
            store: false,
          });
          return response.output_text;
        });
        const currentMiraio = await timed(
          async () => (await brief.generate(entry.input)).say_this[0] ?? null,
        );
        const playbook = await timed(
          async () => (await brief.generate(withPlaybook)).say_this[0] ?? null,
        );

        return {
          current_miraio: { ...currentMiraio, playbook_ids: [] },
          generic_chat: { ...genericChat, playbook_ids: [] },
          playbook: {
            ...playbook,
            playbook_ids: (withPlaybook.opportunity_playbook ?? []).map(
              (hint) => hint.id,
            ),
          },
        };
      };

      const results: {
        entry: ManufacturingComparisonCase;
        conditions: Record<ComparisonCondition, ConditionResult>;
      }[] = [];

      // Sequential on purpose: a rate-limited burst would surface as errors in
      // one condition and bias the comparison against it.
      for (const entry of manufacturingComparisonCases) {
        results.push({ conditions: await runCase(entry), entry });
      }

      writeJson(blindPath, {
        cases: results.map(({ conditions, entry }) => {
          const assignment = assignBlindLabels(entry.caseName);

          return {
            card: entry.input.card,
            case_name: entry.caseName,
            company_context: entry.input.company_context ?? null,
            data_richness: entry.data_richness,
            description: entry.description,
            questions: Object.fromEntries(
              blindLabels.map((label) => [
                label,
                conditions[assignment[label]].question,
              ]),
            ),
            seller: entry.sellerLabel,
          };
        }),
        generated_at: new Date().toISOString(),
        schema_version: 1,
      });

      writeJson(measurementPath, {
        cases: results.map(({ conditions, entry }) => ({
          case_name: entry.caseName,
          conditions: Object.fromEntries(
            Object.entries(conditions).map(([condition, result]) => [
              condition,
              { ...result, single_question: isSingleQuestion(result.question) },
            ]),
          ),
        })),
        model,
        schema_version: 1,
      });

      // A template is written once; a rerun must not erase a reviewer's work.
      if (!existsSync(ratingsPath)) {
        writeJson(ratingsPath, {
          cases: results.map(({ entry }) => ({
            case_name: entry.caseName,
            data_richness: entry.data_richness,
            ratings: blindLabels.map((label) => ({
              label,
              misleading: null,
              notes: "",
              rank: null,
              would_use: null,
            })),
          })),
          schema_version: 1,
        });
      }

      const failures = results.flatMap(({ conditions, entry }) =>
        Object.entries(conditions)
          .filter(([, result]) => result.error)
          .map(
            ([condition, result]) =>
              `${entry.caseName}/${condition}: ${result.error}`,
          ),
      );

      console.info(
        `Wrote ${results.length} cases to ${blindPath}` +
          (failures.length > 0
            ? `\nFailed calls:\n${failures.join("\n")}`
            : ""),
      );
      expect(results).toHaveLength(manufacturingComparisonCases.length);
    },
    manufacturingComparisonCases.length * 3 * perCallTimeoutMilliseconds,
  );
});

type RawRating = Readonly<{
  label: BlindLabel;
  misleading: boolean | null;
  notes?: string;
  rank: 1 | 2 | 3 | null;
  would_use: boolean | null;
}>;

function isRated(
  rating: RawRating,
): rating is RawRating & CaseRating["ratings"][number] {
  return (
    rating.misleading !== null &&
    rating.rank !== null &&
    rating.would_use !== null
  );
}

describe.runIf(runSummary)("manufacturing A/B/C comparison: summary", () => {
  it("unblinds the completed ratings", () => {
    const raw = JSON.parse(readFileSync(ratingsPath, "utf8")) as {
      cases: readonly (Omit<CaseRating, "ratings"> & {
        ratings: readonly RawRating[];
      })[];
    };

    // Cases still being reviewed are left out rather than counted as zeros.
    const completed: CaseRating[] = raw.cases.flatMap((entry) =>
      entry.ratings.every(isRated)
        ? [{ ...entry, ratings: entry.ratings.filter(isRated) }]
        : [],
    );
    const summary = summarizeManufacturingComparison(completed);

    console.info(formatManufacturingComparison(summary));
    expect(summary.case_count).toBe(completed.length);
  });
});
