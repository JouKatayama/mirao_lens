import { z } from "zod";

export const personalContextTypes = [
  "past_experience",
  "expertise",
  "strong_skill",
  "current_theme",
  "offer",
  "seeking",
  "free_text",
] as const;

export const personalContextSourceTypes = [
  "user_entered",
  "ai_suggested",
] as const;

export const personalContextTypeSchema = z.enum(personalContextTypes);
export const personalContextSourceTypeSchema = z.enum(
  personalContextSourceTypes,
);

const profileInputSchema = z
  .object({
    current_company: z.string().trim().max(200).nullable().optional(),
    current_role: z.string().trim().min(1).max(200),
  })
  .strict()
  .transform((profile) => ({
    current_company: profile.current_company?.trim() || null,
    current_role: profile.current_role,
  }));

const optionalAnswerSchema = z.string().trim().max(4000).default("");

export const personalContextOnboardingInputSchema = z
  .object({
    request_id: z.string().uuid(),
    profile: profileInputSchema,
    answers: z
      .object({
        past_experience: optionalAnswerSchema,
        expertise: optionalAnswerSchema,
        strong_skills: optionalAnswerSchema,
        current_themes: optionalAnswerSchema,
        offer: z.string().trim().min(1).max(4000),
        seeking: optionalAnswerSchema,
        free_text: optionalAnswerSchema,
      })
      .strict(),
    locale: z.string().trim().min(2).max(35).default("ja"),
  })
  .strict();

// Keep this schema JSON-Schema-compatible so AI adapters can use it for strict
// structured output. Semantic normalization happens after provider parsing.
export const personalContextSuggestionDraftSchema = z
  .object({
    type: personalContextTypeSchema,
    text: z.string().min(1).max(4000),
    tags: z.array(z.string().min(1).max(64)).max(12),
  })
  .strict();

export const personalContextStructuredOutputSchema = z
  .object({
    suggestions: z.array(personalContextSuggestionDraftSchema).min(1).max(30),
  })
  .strict();

export const personalContextProfileSchema = z
  .object({
    current_company: z.string().nullable(),
    current_role: z.string().nullable(),
  })
  .strict();

export const personalContextItemSchema = z
  .object({
    id: z.string().uuid(),
    type: personalContextTypeSchema,
    text: z.string().min(1).max(4000),
    tags: z.array(z.string()),
    source_type: personalContextSourceTypeSchema,
    user_approved: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

export const personalContextItemUpdateSchema = z
  .object({
    type: personalContextTypeSchema.optional(),
    text: z.string().trim().min(1).max(4000).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
    user_approved: z.boolean().optional(),
  })
  .strict()
  .refine((update) => Object.keys(update).length > 0, {
    message: "At least one mutable field is required.",
  });

export const personalContextResponseSchema = z
  .object({
    profile: personalContextProfileSchema,
    items: z.array(personalContextItemSchema),
  })
  .strict();

export const personalContextOnboardingResponseSchema = z
  .object({
    profile: personalContextProfileSchema,
    suggestions: z.array(personalContextItemSchema),
  })
  .strict();

export type PersonalContextType = z.infer<typeof personalContextTypeSchema>;
export type PersonalContextSourceType = z.infer<
  typeof personalContextSourceTypeSchema
>;
export type PersonalContextOnboardingInput = z.infer<
  typeof personalContextOnboardingInputSchema
>;
export type PersonalContextSuggestionDraft = z.infer<
  typeof personalContextSuggestionDraftSchema
>;
export type PersonalContextStructuredOutput = z.infer<
  typeof personalContextStructuredOutputSchema
>;
export type PersonalContextProfile = z.infer<
  typeof personalContextProfileSchema
>;
export type PersonalContextItem = z.infer<typeof personalContextItemSchema>;
export type PersonalContextItemUpdate = z.infer<
  typeof personalContextItemUpdateSchema
>;
export type PersonalContextResponse = z.infer<
  typeof personalContextResponseSchema
>;
export type PersonalContextOnboardingResponse = z.infer<
  typeof personalContextOnboardingResponseSchema
>;

export class PersonalContextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonalContextValidationError";
  }
}

export function normalizePersonalContextStructuredOutput(
  value: unknown,
): PersonalContextStructuredOutput {
  const parsed = personalContextStructuredOutputSchema.parse(value);
  const seen = new Set<string>();
  const suggestions: PersonalContextSuggestionDraft[] = [];

  for (const suggestion of parsed.suggestions) {
    const text = suggestion.text.trim();

    if (!text) {
      throw new PersonalContextValidationError(
        "Personal Context suggestions cannot contain blank text.",
      );
    }

    const key = `${suggestion.type}:${text.normalize("NFKC").toLocaleLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    suggestions.push({
      type: suggestion.type,
      text,
      tags: [
        ...new Set(suggestion.tags.map((tag) => tag.trim()).filter(Boolean)),
      ],
    });
  }

  if (suggestions.length === 0) {
    throw new PersonalContextValidationError(
      "At least one Personal Context suggestion is required.",
    );
  }

  return { suggestions };
}
