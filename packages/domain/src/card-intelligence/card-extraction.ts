import { z } from "zod";

export const cardFieldNames = [
  "name",
  "company",
  "department",
  "title",
  "email",
  "phone",
  "website",
  "address",
] as const;

export const cardFieldNameSchema = z.enum(cardFieldNames);

const structuredCardFieldSchema = z.string().max(2000).nullable();
const canonicalCardFieldSchema = z.string().trim().min(1).max(2000).nullable();
const confidenceSchema = z.number().min(0).max(1);

const structuredCardFields = {
  address: structuredCardFieldSchema,
  company: structuredCardFieldSchema,
  department: structuredCardFieldSchema,
  email: structuredCardFieldSchema,
  name: structuredCardFieldSchema,
  phone: structuredCardFieldSchema,
  title: structuredCardFieldSchema,
  website: structuredCardFieldSchema,
} as const;

const canonicalCardFields = {
  address: canonicalCardFieldSchema,
  company: canonicalCardFieldSchema,
  department: canonicalCardFieldSchema,
  email: canonicalCardFieldSchema,
  name: canonicalCardFieldSchema,
  phone: canonicalCardFieldSchema,
  title: canonicalCardFieldSchema,
  website: canonicalCardFieldSchema,
} as const;

const confidenceFields = {
  address: confidenceSchema,
  company: confidenceSchema,
  department: confidenceSchema,
  email: confidenceSchema,
  name: confidenceSchema,
  phone: confidenceSchema,
  title: confidenceSchema,
  website: confidenceSchema,
} as const;

export const cardFieldsSchema = z.object(canonicalCardFields).strict();
export const cardFieldConfidenceSchema = z.object(confidenceFields).strict();

export const cardExtractionStructuredOutputSchema = z
  .object({
    ...structuredCardFields,
    field_confidence: cardFieldConfidenceSchema,
    language: z.string().max(35),
  })
  .strict();

export const cardExtractionSchema = z
  .object({
    ...canonicalCardFields,
    field_confidence: cardFieldConfidenceSchema,
    language: z.string().trim().min(2).max(35),
  })
  .strict()
  .superRefine((extraction, context) => {
    for (const field of cardFieldNames) {
      if (
        extraction[field] === null &&
        extraction.field_confidence[field] !== 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A null field must have zero confidence.",
          path: ["field_confidence", field],
        });
      }
    }
  });

export const cardCorrectionSchema = cardFieldsSchema
  .partial()
  .strict()
  .refine((correction) => Object.keys(correction).length > 0, {
    message: "At least one card field correction is required.",
  });

export const cardFieldClaimSchema = z
  .object({
    claim_type: z.literal("fact"),
    confidence: confidenceSchema,
    field: cardFieldNameSchema,
    source_type: z.enum(["business_card", "user_correction"]),
    value: z.string().min(1),
  })
  .strict();

export const businessCardRecordSchema = z
  .object({
    ...canonicalCardFields,
    created_at: z.string().datetime({ offset: true }),
    extraction_json: cardExtractionSchema,
    field_confidence: cardFieldConfidenceSchema,
    id: z.string().uuid(),
    language: z.string().trim().min(2).max(35),
    scan_id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
    user_corrected: z.boolean(),
  })
  .strict();

export const businessCardPublicSchema = z
  .object({
    ...canonicalCardFields,
    claims: z.array(cardFieldClaimSchema),
    field_confidence: cardFieldConfidenceSchema,
    language: z.string().trim().min(2).max(35),
    user_corrected: z.boolean(),
  })
  .strict();

const extractingStatusSchema = z
  .object({
    card: z.null(),
    error_code: z.null(),
    scan_id: z.string().uuid(),
    status: z.literal("extracting"),
  })
  .strict();

const readyStatusSchema = z
  .object({
    card: businessCardPublicSchema,
    error_code: z.null(),
    scan_id: z.string().uuid(),
    status: z.literal("card_ready"),
  })
  .strict();

const failedStatusSchema = z
  .object({
    card: z.null(),
    error_code: z.string().min(1).max(100).nullable(),
    scan_id: z.string().uuid(),
    status: z.enum(["failed_retryable", "failed_terminal"]),
  })
  .strict();

export const cardIntelligenceStatusResponseSchema = z.discriminatedUnion(
  "status",
  [extractingStatusSchema, readyStatusSchema, failedStatusSchema],
);

export type CardFieldName = z.infer<typeof cardFieldNameSchema>;
export type CardFields = z.infer<typeof cardFieldsSchema>;
export type CardFieldConfidence = z.infer<typeof cardFieldConfidenceSchema>;
export type CardExtractionStructuredOutput = z.infer<
  typeof cardExtractionStructuredOutputSchema
>;
export type CardExtraction = z.infer<typeof cardExtractionSchema>;
export type CardCorrection = z.infer<typeof cardCorrectionSchema>;
export type CardFieldClaim = z.infer<typeof cardFieldClaimSchema>;
export type BusinessCardRecord = z.infer<typeof businessCardRecordSchema>;
export type BusinessCardPublic = z.infer<typeof businessCardPublicSchema>;
export type CardIntelligenceStatusResponse = z.infer<
  typeof cardIntelligenceStatusResponseSchema
>;

function normalizeNullableField(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value.trim() || null;
}

export function normalizeCardExtraction(input: unknown): CardExtraction {
  const structured = cardExtractionStructuredOutputSchema.parse(input);
  const fields = Object.fromEntries(
    cardFieldNames.map((field) => [
      field,
      normalizeNullableField(structured[field]),
    ]),
  ) as CardFields;
  const fieldConfidence = Object.fromEntries(
    cardFieldNames.map((field) => [
      field,
      fields[field] === null ? 0 : structured.field_confidence[field],
    ]),
  ) as CardFieldConfidence;

  return cardExtractionSchema.parse({
    ...fields,
    field_confidence: fieldConfidence,
    language: structured.language.trim().toLowerCase(),
  });
}

export function createCardFactClaims(
  fields: CardFields,
  fieldConfidence: CardFieldConfidence,
  correctedFields: readonly CardFieldName[] = [],
): CardFieldClaim[] {
  const corrected = new Set(correctedFields);

  return cardFieldNames.flatMap((field) => {
    const value = fields[field];

    return value === null
      ? []
      : [
          {
            claim_type: "fact" as const,
            confidence: fieldConfidence[field],
            field,
            source_type: corrected.has(field)
              ? ("user_correction" as const)
              : ("business_card" as const),
            value,
          },
        ];
  });
}

export function toBusinessCardPublic(
  record: BusinessCardRecord,
  correctedFields: readonly CardFieldName[] = [],
): BusinessCardPublic {
  const parsed = businessCardRecordSchema.parse(record);
  const fields = cardFieldsSchema.parse(
    Object.fromEntries(cardFieldNames.map((field) => [field, parsed[field]])),
  );

  return businessCardPublicSchema.parse({
    ...fields,
    claims: createCardFactClaims(
      fields,
      parsed.field_confidence,
      correctedFields,
    ),
    field_confidence: parsed.field_confidence,
    language: parsed.language,
    user_corrected: parsed.user_corrected,
  });
}
