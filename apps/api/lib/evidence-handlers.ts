import {
  authenticateEvidenceSession,
  EvidenceRepositoryError,
} from "@miraio/db";
import { scanRecordSchema } from "@miraio/domain";

import {
  readServerSupabaseConfig,
  ServerConfigurationError,
} from "./server-config";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

type EvidenceRepositoryPort = Readonly<{
  getEvidenceForScan(scanId: string): Promise<
    {
      confidence: number;
      excerpt: string | null;
      id: string;
      retrieved_at: string | null;
      source_title: string | null;
      source_type: string;
      source_url: string | null;
    }[]
  >;
}>;

type EvidenceSession = Readonly<{
  repository: EvidenceRepositoryPort;
  userId: string;
}>;

export type EvidenceHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<EvidenceSession | null>;
}>;

type ScanRouteContext = Readonly<{
  params: Promise<{ scanId: string }>;
}>;

type ErrorBody = Readonly<{
  error: { code: string; correlation_id?: string; message: string };
}>;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { headers: corsHeaders, status });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  correlationId?: string,
): Response {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(correlationId ? { correlation_id: correlationId } : {}),
    },
  };
  return jsonResponse(body, status);
}

function internalError(code: string): Response {
  return errorResponse(
    500,
    code,
    "The request could not be completed.",
    crypto.randomUUID(),
  );
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const [scheme, token, ...rest] = authorization.split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && token && rest.length === 0
    ? token
    : null;
}

async function authenticateRequest(
  request: Request,
  dependencies: EvidenceHandlerDependencies,
): Promise<EvidenceSession | Response> {
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return errorResponse(401, "unauthorized", "Authentication is required.");
  }

  try {
    const session = await dependencies.authenticate(accessToken);
    return (
      session ??
      errorResponse(401, "unauthorized", "Authentication is required.")
    );
  } catch (error) {
    return error instanceof ServerConfigurationError
      ? internalError("service_unconfigured")
      : internalError("authentication_unavailable");
  }
}

async function readValidScanId(
  context: ScanRouteContext,
): Promise<string | null> {
  const { scanId } = await context.params;
  const parsed = scanRecordSchema.shape.id.safeParse(scanId);
  return parsed.success ? parsed.data : null;
}

export function createGetEvidenceHandler(
  dependencies: EvidenceHandlerDependencies,
): (request: Request, context: ScanRouteContext) => Promise<Response> {
  return async (request, context) => {
    const session = await authenticateRequest(request, dependencies);

    if (session instanceof Response) {
      return session;
    }

    const scanId = await readValidScanId(context);

    if (!scanId) {
      return errorResponse(404, "not_found", "Scan not found.");
    }

    try {
      const items = await session.repository.getEvidenceForScan(scanId);
      return jsonResponse({ items, scan_id: scanId });
    } catch (error) {
      return error instanceof EvidenceRepositoryError
        ? internalError("evidence_read_failed")
        : internalError("evidence_request_failed");
    }
  };
}

export function EVIDENCE_OPTIONS(): Response {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export const productionEvidenceHandlerDependencies: EvidenceHandlerDependencies =
  {
    async authenticate(accessToken) {
      return authenticateEvidenceSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  };
