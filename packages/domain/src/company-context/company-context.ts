import { z } from "zod";

export const companyScaleSchema = z.enum([
  "startup",
  "sme",
  "enterprise",
  "unknown",
]);

export type CompanyScale = z.infer<typeof companyScaleSchema>;

export const roleLevelSchema = z.enum([
  "individual_contributor",
  "manager",
  "director",
  "executive",
  "unknown",
]);

export type RoleLevel = z.infer<typeof roleLevelSchema>;

// Every nullable string carries an explicit `.max()`. Beyond bounding stored
// values, the modifier is load-bearing for the wire contract: without it the
// Zod-to-JSON-Schema conversion used by AI adapters emits the OpenAPI 3.0 form
// `{"type":"string","nullable":true}`, which OpenAI strict structured output
// rejects. With it, the conversion emits the JSON Schema union form
// `{"anyOf":[{"type":"string","maxLength":N},{"type":"null"}]}`.
// See packages/ai/src/structured-output-schema.test.ts.
export const companyContextSchema = z
  .object({
    company_description: z.string().max(1000).nullable(),
    industry: z.string().max(200).nullable(),
    company_scale: companyScaleSchema,
    role_scope: z.string().max(1000).nullable(),
    role_level: roleLevelSchema,
  })
  .strict();

export type CompanyContext = z.infer<typeof companyContextSchema>;

export const companyContextInputSchema = z
  .object({
    company: z.string().nullable(),
    department: z.string().nullable(),
    locale: z.string().min(2).max(35).default("ja"),
    title: z.string().nullable(),
  })
  .strict();

export type CompanyContextInput = z.infer<typeof companyContextInputSchema>;

export const companyContextStructuredOutputSchema = companyContextSchema;
