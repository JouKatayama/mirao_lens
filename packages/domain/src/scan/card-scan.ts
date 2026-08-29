import { z } from "zod";

export const meetingGoals = [
  "networking",
  "sales",
  "recruiting",
  "partnership",
  "learning_information_exchange",
  "other",
] as const;

export const scanDatabaseStatuses = [
  "created",
  "image_uploaded",
  "extracting_card",
  "card_ready",
  "fast_context",
  "generating_brief",
  "brief_ready",
  "deep_enrichment",
  "deep_ready",
  "failed_retryable",
  "failed_terminal",
] as const;

export const scanImageContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const maximumScanImageBytes = 10 * 1024 * 1024;
export const rawScanImageLifetimeMilliseconds = 60 * 60 * 1000;

export const meetingGoalSchema = z.enum(meetingGoals);
export const scanDatabaseStatusSchema = z.enum(scanDatabaseStatuses);
export const scanImageContentTypeSchema = z.enum(scanImageContentTypes);

export const scanCaptureMetadataSchema = z
  .object({
    scan_id: z.string().uuid(),
    meeting_goal: meetingGoalSchema,
    content_type: scanImageContentTypeSchema,
  })
  .strict();

export const scanImagePayloadSchema = scanCaptureMetadataSchema
  .extend({
    image_byte_length: z.number().int().min(1).max(maximumScanImageBytes),
  })
  .strict();

export const scanRecordSchema = z
  .object({
    id: z.string().uuid(),
    meeting_goal: meetingGoalSchema,
    raw_image_expires_at: z.string().datetime({ offset: true }).nullable(),
    raw_image_path: z.string().min(1).nullable(),
    status: scanDatabaseStatusSchema,
  })
  .strict();

export const scanCreateResponseSchema = z
  .object({
    scan_id: z.string().uuid(),
    status: z.literal("extracting"),
  })
  .strict();

export type MeetingGoal = z.infer<typeof meetingGoalSchema>;
export type ScanCaptureMetadata = z.infer<typeof scanCaptureMetadataSchema>;
export type ScanImageContentType = z.infer<typeof scanImageContentTypeSchema>;
export type ScanImagePayload = z.infer<typeof scanImagePayloadSchema>;
export type ScanRecord = z.infer<typeof scanRecordSchema>;
export type ScanCreateResponse = z.infer<typeof scanCreateResponseSchema>;

// ─── Scan history list ────────────────────────────────────────────────────────

export const scanHistoryStatuses = [
  "processing",
  "brief_ready",
  "deep_enrichment",
  "deep_ready",
  "failed",
] as const;

export const scanHistoryStatusSchema = z.enum(scanHistoryStatuses);
export type ScanHistoryStatus = z.infer<typeof scanHistoryStatusSchema>;

export const scanHistoryItemSchema = z
  .object({
    card_company: z.string().nullable(),
    card_name: z.string().nullable(),
    card_title: z.string().nullable(),
    created_at: z.string().min(1),
    meeting_goal: meetingGoalSchema,
    scan_id: z.string().uuid(),
    status: scanHistoryStatusSchema,
  })
  .strict();
export type ScanHistoryItem = z.infer<typeof scanHistoryItemSchema>;

export const scanListResponseSchema = z
  .object({ items: z.array(scanHistoryItemSchema) })
  .strict();
export type ScanListResponse = z.infer<typeof scanListResponseSchema>;

export function toScanHistoryStatus(dbStatus: string): ScanHistoryStatus {
  if (dbStatus === "brief_ready") return "brief_ready";
  if (dbStatus === "deep_enrichment") return "deep_enrichment";
  if (dbStatus === "deep_ready") return "deep_ready";
  if (dbStatus === "failed_retryable" || dbStatus === "failed_terminal")
    return "failed";
  return "processing";
}

const scanImageExtensions: Record<ScanImageContentType, string> = {
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const contentTypesByExtension: Readonly<
  Record<string, ScanImageContentType | undefined>
> = {
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function extensionForScanImage(
  contentType: ScanImageContentType,
): string {
  return scanImageExtensions[contentType];
}

export function contentTypeForScanImagePath(
  path: string,
): ScanImageContentType | null {
  const extension = path.split(".").pop()?.toLowerCase();

  return extension ? (contentTypesByExtension[extension] ?? null) : null;
}

export function createRawScanImageExpiration(now: Date): string {
  return new Date(
    now.getTime() + rawScanImageLifetimeMilliseconds,
  ).toISOString();
}
