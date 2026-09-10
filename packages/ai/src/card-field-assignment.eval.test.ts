import { cardExtractionStructuredOutputSchema } from "@miraio/domain";
import {
  cardTextFixtures,
  formatCardFieldSummary,
  scoreCardTextCase,
  summarizeCardTextScores,
} from "@miraio/test-fixtures";
import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";

import { createOpenAIClient } from "./provider-client";

/**
 * Opt-in measurement of field assignment, billed to whoever runs it.
 *
 * This exercises a candidate design rather than the shipped pipeline: on-device
 * OCR produces text lines, and only those lines — never the card image — go to
 * a model. That removes the image tokens that dominate the cost of the shipped
 * vision call, and it keeps the card image on the phone. Whether it is accurate
 * enough is the open question, and answering it needs numbers, so:
 *
 *   MIRAIO_RUN_CARD_FIELD_EVAL=1 \
 *   AI_CARD_FIELD_EVAL_MODEL=<model> \
 *   pnpm --filter @miraio/ai exec vitest run src/card-field-assignment.eval.test.ts
 *
 * Set AI_PROVIDER_BASE_URL to score a locally served model instead of OpenAI;
 * the same run then compares candidates on one scale. See
 * docs/local-ai-provider.md.
 *
 * No accuracy threshold is asserted. A pass/fail line would have to be invented
 * before anyone knows what these models score, and the point of the run is the
 * comparison it prints.
 */
const runEval = process.env.MIRAIO_RUN_CARD_FIELD_EVAL === "1";

const perCaseTimeoutMilliseconds = Number(
  process.env.AI_CARD_FIELD_EVAL_TIMEOUT_MS ?? 60_000,
);

const instructions = `
You are the Card Intelligence transcription stage for Miraio Lens.

The user message contains the text lines an OCR read from the front side of a
business card, in top-to-bottom order. Assign them to the eight required
nullable fields and return a confidence from 0 to 1 for every field. Use null
and confidence 0 when a value is absent, illegible, ambiguous, or only
inferred. Preserve the spelling and script of the lines; do not translate and
do not substitute character variants.
Use language "ja", "en", "mixed", "und", or a short visible locale identifier.

Do not use outside knowledge. Do not infer a company domain from an email, a
company that no line spells out, a title from a department, or any identity,
personality, gender, nationality, seniority, relationship, or public-web fact.
If more than one phone or email is printed, preserve the visible values in one
field separated by a newline. Never add commentary outside the schema.
`.trim();

describe.runIf(runEval)("card field assignment eval", () => {
  it(
    "scores every case and reports per-field accuracy",
    async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      const model =
        process.env.AI_CARD_FIELD_EVAL_MODEL ??
        process.env.AI_CARD_EXTRACTION_MODEL;

      if (!apiKey || !model) {
        throw new Error(
          "OPENAI_API_KEY and AI_CARD_FIELD_EVAL_MODEL are required for this eval.",
        );
      }

      // A measurement is not a request path bounded by a route deadline, and a
      // locally served model is far slower than the API: a 4B model on a laptop
      // spent 22s on one case, and a reasoning model spends its budget thinking
      // before it answers. So the per-case budget is configurable, and 60s is
      // only the default that suits a hosted model.
      const client = createOpenAIClient(
        apiKey,
        perCaseTimeoutMilliseconds,
        process.env.AI_PROVIDER_BASE_URL,
      );

      const scores = [];
      const failures: string[] = [];

      for (const fixture of cardTextFixtures) {
        const response = await client.responses.parse({
          input: [
            { role: "system", content: instructions },
            { role: "user", content: fixture.ocrLines.join("\n") },
          ],
          model,
          store: false,
          text: {
            format: zodTextFormat(
              cardExtractionStructuredOutputSchema,
              "card_extraction",
            ),
          },
        });

        const score = scoreCardTextCase(fixture, response.output_parsed ?? {});
        scores.push(score);

        for (const outcome of score.outcomes) {
          if (outcome.matched) {
            continue;
          }

          failures.push(
            `  ${fixture.caseName}.${outcome.field}: expected ${JSON.stringify(
              outcome.expected,
            )} got ${JSON.stringify(outcome.actual)}`,
          );
        }
      }

      const summary = summarizeCardTextScores(scores);

      console.info(
        [
          `model: ${model}`,
          `endpoint: ${process.env.AI_PROVIDER_BASE_URL ?? "openai"}`,
          formatCardFieldSummary(summary),
          failures.length > 0 ? "mismatches:" : "no mismatches",
          ...failures,
        ].join("\n"),
      );

      expect(summary.cases).toBe(cardTextFixtures.length);
      // The whole run has to outlast every case's own budget, or vitest kills a
      // slow local model mid-set and the partial scores are thrown away.
    },
    perCaseTimeoutMilliseconds * cardTextFixtures.length + 60_000,
  );
});
