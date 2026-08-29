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

export const companyContextSchema = z
  .object({
    company_description: z.string().nullable(),
    industry: z.string().nullable(),
    company_scale: companyScaleSchema,
    role_scope: z.string().nullable(),
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
