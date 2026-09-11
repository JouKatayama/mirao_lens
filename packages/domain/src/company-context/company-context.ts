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
// A page the stage actually read while researching the company. `url` stays a
// plain bounded string rather than z.string().url(): the Zod-to-JSON-Schema
// conversion would emit `"format":"uri"`, which strict structured output
// rejects. The scheme is enforced by toPublicHttpUrl where the value is used.
export const companySourceSchema = z
  .object({
    title: z.string().max(200).nullable(),
    url: z.string().max(2000),
  })
  .strict();

export type CompanySource = z.infer<typeof companySourceSchema>;

export const maximumCompanySources = 4;

export const companyContextSchema = z
  .object({
    company_description: z.string().max(1000).nullable(),
    industry: z.string().max(200).nullable(),
    company_scale: companyScaleSchema,
    role_scope: z.string().max(1000).nullable(),
    role_level: roleLevelSchema,
    // Web research is opt-in, and context stored before it existed carries no
    // sources at all, so the canonical form defaults the field.
    sources: z
      .array(companySourceSchema)
      .max(maximumCompanySources)
      .default([]),
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

// The provider always states the field, empty when it read nothing.
export const companyContextStructuredOutputSchema = companyContextSchema
  .omit({ sources: true })
  .extend({
    sources: z.array(companySourceSchema).max(maximumCompanySources),
  })
  .strict();
