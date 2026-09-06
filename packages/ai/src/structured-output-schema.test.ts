import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import {
  cardExtractionStructuredOutputSchema,
  companyContextStructuredOutputSchema,
  flashBriefStructuredOutputSchema,
  mutualValueStructuredOutputSchema,
  personalContextStructuredOutputSchema,
} from "@miraio/domain";

// Guards the wire contract between packages/domain schemas and the OpenAI
// structured-output adapters. A nullable Zod string with no length modifier
// converts to the OpenAPI 3.0 form {"type":"string","nullable":true}, which is
// not valid JSON Schema and which OpenAI strict mode rejects at request time.
// The rejection surfaces as a plain 400 with no rate-limit or timeout marker,
// so every adapter misreports it as `provider_unavailable` — a stage that never
// succeeds while looking like a provider outage. Adding `.max(N)` to the field
// moves the conversion onto the JSON Schema union form and fixes the contract.

const structuredOutputSchemas = [
  ["card_extraction", cardExtractionStructuredOutputSchema],
  ["company_context", companyContextStructuredOutputSchema],
  ["flash_brief", flashBriefStructuredOutputSchema],
  ["mutual_value", mutualValueStructuredOutputSchema],
  ["personal_context_suggestions", personalContextStructuredOutputSchema],
] as const;

function generatedSchema(name: string, schema: unknown): unknown {
  const format = zodTextFormat(schema as never, name) as { schema: unknown };
  return format.schema;
}

describe("structured output wire schemas", () => {
  it.each(structuredOutputSchemas)(
    "%s never emits the OpenAPI-only nullable keyword",
    (name, schema) => {
      const json = JSON.stringify(generatedSchema(name, schema));

      expect(json).not.toContain('"nullable"');
    },
  );

  it("expresses an optional company description as a JSON Schema union", () => {
    const schema = generatedSchema(
      "company_context",
      companyContextStructuredOutputSchema,
    ) as {
      properties: Record<string, unknown>;
    };

    expect(schema.properties.company_description).toEqual({
      anyOf: [
        { type: "string", maxLength: 1000 },
        { type: "null" },
      ],
    });
  });
});
