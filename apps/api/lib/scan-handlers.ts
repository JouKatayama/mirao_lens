import {
  authenticateCardIntelligenceSession,
  authenticateScanDatabaseSession,
  ScanRepositoryError,
  type ScanReservation,
} from "@miraio/db";
import {
  createRawScanImageExpiration,
  extensionForScanImage,
  maximumScanImageBytes,
  scanCaptureMetadataSchema,
  scanImagePayloadSchema,
  scanListResponseSchema,
  scanRecordSchema,
  type ScanCaptureMetadata,
  type ScanHistoryItem,
  type ScanImageContentType,
  type ScanRecord,
} from "@miraio/domain";
import { after } from "next/server";

import { processProductionCardEvidence } from "./card-evidence";
import { processProductionCardIntelligence } from "./card-intelligence";
import { processProductionCompanyContext } from "./company-context";
import { processProductionCompanyEvidence } from "./company-evidence";
import { processProductionFlashBrief } from "./flash-brief";
import { processProductionIdentityResolution } from "./identity-resolution";
import { processProductionMutualValue } from "./mutual-value";
import {
  readServerSupabaseConfig,
  ServerConfigurationError,
} from "./server-config";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Meeting-Goal, X-Scan-Id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

type ScanRepositoryPort = Readonly<{
  completeUpload(scanId: string): Promise<ScanRecord>;
  markUploadFailed(scanId: string): Promise<void>;
  reserve(input: {
    expiresAt: string;
    meetingGoal: ScanCaptureMetadata["meeting_goal"];
    rawImagePath: string;
    scanId: string;
  }): Promise<ScanReservation>;
  uploadRawImage(
    rawImagePath: string,
    bytes: ArrayBuffer,
    contentType: ScanImageContentType,
  ): Promise<void>;
}>;

type ScanSession = Readonly<{
  repository: ScanRepositoryPort;
  userId: string;
}>;

export type ScanHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<ScanSession | null>;
  now(): Date;
  scheduleExtraction(input: { accessToken: string; scanId: string }): void;
}>;

type ErrorBody = Readonly<{
  error: {
    code: string;
    correlation_id?: string;
    message: string;
    scan_id?: string;
  };
}>;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { headers: corsHeaders, status });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  options?: Readonly<{ correlationId?: string; scanId?: string }>,
): Response {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(options?.correlationId
        ? { correlation_id: options.correlationId }
        : {}),
      ...(options?.scanId ? { scan_id: options.scanId } : {}),
    },
  };

  return jsonResponse(body, status);
}

function internalError(code: string): Response {
  return errorResponse(500, code, "The request could not be completed.", {
    correlationId: crypto.randomUUID(),
  });
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization) {
    return null;
  }

  const [scheme, token, ...rest] = authorization.split(/\s+/);

  return scheme?.toLowerCase() === "bearer" && token && rest.length === 0
    ? token
    : null;
}

function readMetadata(request: Request): ScanCaptureMetadata | null {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const parsed = scanCaptureMetadataSchema.safeParse({
    content_type: contentType,
    meeting_goal: request.headers.get("x-meeting-goal")?.trim(),
    scan_id: request.headers.get("x-scan-id")?.trim(),
  });

  return parsed.success ? parsed.data : null;
}

function contentLengthExceedsLimit(request: Request): boolean {
  const value = request.headers.get("content-length")?.trim();

  if (!value) {
    return false;
  }

  const length = Number(value);
  return Number.isFinite(length) && length > maximumScanImageBytes;
}

class ScanImageTooLargeError extends Error {}

async function readBoundedImageBody(request: Request): Promise<ArrayBuffer> {
  if (!request.body) {
    return new ArrayBuffer(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > maximumScanImageBytes) {
      await reader.cancel();
      throw new ScanImageTooLargeError();
    }

    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

async function markFailed(
  repository: ScanRepositoryPort,
  scanId: string,
): Promise<void> {
  try {
    await repository.markUploadFailed(scanId);
  } catch {
    // The original sanitized failure remains the response; never log card data.
  }
}

export function createPostScanHandler(
  dependencies: ScanHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const accessToken = readBearerToken(request);

    if (!accessToken) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    let session: ScanSession | null;

    try {
      session = await dependencies.authenticate(accessToken);
    } catch (error) {
      return error instanceof ServerConfigurationError
        ? internalError("service_unconfigured")
        : internalError("authentication_unavailable");
    }

    if (!session) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    const metadata = readMetadata(request);

    if (!metadata) {
      return errorResponse(
        400,
        "invalid_scan_metadata",
        "Check the scan ID, meeting goal, and image type.",
      );
    }

    if (contentLengthExceedsLimit(request)) {
      return errorResponse(
        413,
        "image_too_large",
        "The card image must be 10 MiB or smaller.",
      );
    }

    let bytes: ArrayBuffer;

    try {
      bytes = await readBoundedImageBody(request);
    } catch (error) {
      if (error instanceof ScanImageTooLargeError) {
        return errorResponse(
          413,
          "image_too_large",
          "The card image must be 10 MiB or smaller.",
        );
      }

      return errorResponse(
        400,
        "invalid_image",
        "A readable card image is required.",
      );
    }

    const payload = scanImagePayloadSchema.safeParse({
      ...metadata,
      image_byte_length: bytes.byteLength,
    });

    if (!payload.success) {
      return bytes.byteLength > maximumScanImageBytes
        ? errorResponse(
            413,
            "image_too_large",
            "The card image must be 10 MiB or smaller.",
          )
        : errorResponse(
            400,
            "invalid_image",
            "A non-empty card image is required.",
          );
    }

    const rawImagePath = `${session.userId}/${metadata.scan_id}/front.${extensionForScanImage(metadata.content_type)}`;
    let reservation: ScanReservation;

    try {
      reservation = await session.repository.reserve({
        expiresAt: createRawScanImageExpiration(dependencies.now()),
        meetingGoal: metadata.meeting_goal,
        rawImagePath,
        scanId: metadata.scan_id,
      });
    } catch (error) {
      if (error instanceof ScanRepositoryError && error.code === "conflict") {
        return errorResponse(
          409,
          "scan_conflict",
          "This scan ID cannot be reused with different capture metadata.",
        );
      }

      return internalError("scan_reservation_failed");
    }

    if (!reservation.needsUpload) {
      if (reservation.record.status === "extracting_card") {
        dependencies.scheduleExtraction({
          accessToken,
          scanId: metadata.scan_id,
        });
      }

      return jsonResponse(
        { scan_id: metadata.scan_id, status: "extracting" },
        200,
      );
    }

    try {
      await session.repository.uploadRawImage(
        rawImagePath,
        bytes,
        metadata.content_type,
      );
      await session.repository.completeUpload(metadata.scan_id);
      dependencies.scheduleExtraction({
        accessToken,
        scanId: metadata.scan_id,
      });

      return jsonResponse(
        { scan_id: metadata.scan_id, status: "extracting" },
        reservation.replayed ? 200 : 201,
      );
    } catch (error) {
      await markFailed(session.repository, metadata.scan_id);

      if (
        error instanceof ScanRepositoryError &&
        error.code === "storage_error"
      ) {
        return errorResponse(
          503,
          "scan_upload_unavailable",
          "The card image could not be uploaded. Please retry.",
          { scanId: metadata.scan_id },
        );
      }

      return internalError("scan_completion_failed");
    }
  };
}

export function OPTIONS(): Response {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

// ─── GET /v1/scans — list the authenticated user's scans ─────────────────────

type GetScansRepositoryPort = Readonly<{
  listScans(limit: number): Promise<ScanHistoryItem[]>;
}>;

type GetScansSession = Readonly<{
  repository: GetScansRepositoryPort;
}>;

export type GetScansHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<GetScansSession | null>;
}>;

export function createGetScansHandler(
  dependencies: GetScansHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const accessToken = readBearerToken(request);

    if (!accessToken) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    let session: GetScansSession | null;

    try {
      session = await dependencies.authenticate(accessToken);
    } catch (error) {
      return error instanceof ServerConfigurationError
        ? internalError("service_unconfigured")
        : internalError("authentication_unavailable");
    }

    if (!session) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    try {
      const items = await session.repository.listScans(20);
      return jsonResponse(scanListResponseSchema.parse({ items }));
    } catch {
      return internalError("scan_list_failed");
    }
  };
}

export const productionGetScansHandlerDependencies: GetScansHandlerDependencies =
  {
    async authenticate(accessToken) {
      return authenticateCardIntelligenceSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  };

// ─── DELETE /v1/scans/:scanId ─────────────────────────────────────────────────

type DeleteScanRouteContext = Readonly<{
  params: Promise<{ scanId: string }>;
}>;

type DeleteScanRepositoryPort = Readonly<{
  deleteScan(scanId: string, userId: string): Promise<boolean>;
}>;

type DeleteScanSession = Readonly<{
  repository: DeleteScanRepositoryPort;
  userId: string;
}>;

export type DeleteScanHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<DeleteScanSession | null>;
}>;

export function createDeleteScanHandler(
  dependencies: DeleteScanHandlerDependencies,
): (request: Request, context: DeleteScanRouteContext) => Promise<Response> {
  return async (request, context) => {
    const accessToken = readBearerToken(request);

    if (!accessToken) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    let session: DeleteScanSession | null;

    try {
      session = await dependencies.authenticate(accessToken);
    } catch (error) {
      return error instanceof ServerConfigurationError
        ? internalError("service_unconfigured")
        : internalError("authentication_unavailable");
    }

    if (!session) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    const { scanId: rawScanId } = await context.params;
    const parsedScanId = scanRecordSchema.shape.id.safeParse(rawScanId);

    if (!parsedScanId.success) {
      return errorResponse(404, "not_found", "Scan not found.");
    }

    try {
      const deleted = await session.repository.deleteScan(
        parsedScanId.data,
        session.userId,
      );

      return deleted
        ? new Response(null, { headers: corsHeaders, status: 204 })
        : errorResponse(404, "not_found", "Scan not found.");
    } catch {
      return internalError("scan_delete_failed");
    }
  };
}

export const productionDeleteScanHandlerDependencies: DeleteScanHandlerDependencies =
  {
    async authenticate(accessToken) {
      return authenticateCardIntelligenceSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  };

export const productionScanDependencies: ScanHandlerDependencies = {
  async authenticate(accessToken) {
    return authenticateScanDatabaseSession(
      readServerSupabaseConfig(process.env),
      accessToken,
    );
  },
  now: () => new Date(),
  scheduleExtraction(input) {
    after(async () => {
      const cardResult = await processProductionCardIntelligence(input);
      if (cardResult.status === "completed") {
        // Card evidence records are created immediately so they are available
        // for the full pipeline. Non-blocking on failure.
        await processProductionCardEvidence(input);
        // Company context: fail_company_context advances scan to
        // generating_brief so Flash Brief still runs on failure.
        await processProductionCompanyContext(input);
        // Company evidence and identity resolution are both non-blocking.
        await processProductionCompanyEvidence(input);
        await processProductionIdentityResolution(input);
        const briefResult = await processProductionFlashBrief(input);
        if (briefResult.status === "completed") {
          await processProductionMutualValue(input);
        }
      }
    });
  },
};
