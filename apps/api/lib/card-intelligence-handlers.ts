import {
  authenticateCardIntelligenceSession,
  CardIntelligenceRepositoryError,
} from "@miraio/db";
import {
  cardCorrectionSchema,
  scanRecordSchema,
  scanStatusResponseSchema,
  type BusinessCardRecord,
  type CardCorrection,
  type ScanStatusResponse,
} from "@miraio/domain";

import {
  readServerSupabaseConfig,
  ServerConfigurationError,
} from "./server-config";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

type CardIntelligenceRepositoryPort = Readonly<{
  correctCard(
    scanId: string,
    correction: CardCorrection,
  ): Promise<BusinessCardRecord | null>;
  getStatus(scanId: string): Promise<ScanStatusResponse | null>;
}>;

type CardIntelligenceSession = Readonly<{
  repository: CardIntelligenceRepositoryPort;
  userId: string;
}>;

export type CardIntelligenceHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<CardIntelligenceSession | null>;
}>;

type ScanRouteContext = Readonly<{
  params: Promise<{ scanId: string }>;
}>;

type ErrorBody = Readonly<{
  error: {
    code: string;
    correlation_id?: string;
    details?: { message: string; path: string }[];
    message: string;
  };
}>;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { headers: corsHeaders, status });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  options?: Readonly<{
    correlationId?: string;
    details?: { message: string; path: string }[];
  }>,
): Response {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(options?.correlationId
        ? { correlation_id: options.correlationId }
        : {}),
      ...(options?.details ? { details: options.details } : {}),
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

async function authenticateRequest(
  request: Request,
  dependencies: CardIntelligenceHandlerDependencies,
): Promise<CardIntelligenceSession | Response> {
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

async function readOwnedScanId(
  context: ScanRouteContext,
): Promise<string | null> {
  const { scanId } = await context.params;
  const parsed = scanRecordSchema.shape.id.safeParse(scanId);

  return parsed.success ? parsed.data : null;
}

function persistenceError(error: unknown): Response {
  return error instanceof CardIntelligenceRepositoryError
    ? internalError("card_persistence_failed")
    : internalError("card_request_failed");
}

export function createGetCardIntelligenceStatusHandler(
  dependencies: CardIntelligenceHandlerDependencies,
): (request: Request, context: ScanRouteContext) => Promise<Response> {
  return async (request, context) => {
    const session = await authenticateRequest(request, dependencies);

    if (session instanceof Response) {
      return session;
    }

    const scanId = await readOwnedScanId(context);

    if (!scanId) {
      return errorResponse(404, "not_found", "Scan not found.");
    }

    try {
      const status = await session.repository.getStatus(scanId);

      return status
        ? jsonResponse(scanStatusResponseSchema.parse(status))
        : errorResponse(404, "not_found", "Scan not found.");
    } catch (error) {
      return persistenceError(error);
    }
  };
}

export function createPatchBusinessCardHandler(
  dependencies: CardIntelligenceHandlerDependencies,
): (request: Request, context: ScanRouteContext) => Promise<Response> {
  return async (request, context) => {
    const session = await authenticateRequest(request, dependencies);

    if (session instanceof Response) {
      return session;
    }

    const scanId = await readOwnedScanId(context);

    if (!scanId) {
      return errorResponse(404, "not_found", "Scan not found.");
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return errorResponse(
        400,
        "invalid_json",
        "A valid JSON body is required.",
      );
    }

    const correction = cardCorrectionSchema.safeParse(body);

    if (!correction.success) {
      return errorResponse(
        400,
        "invalid_card_correction",
        "Check the fields.",
        {
          details: correction.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.join("."),
          })),
        },
      );
    }

    try {
      const card = await session.repository.correctCard(
        scanId,
        correction.data,
      );

      if (!card) {
        return errorResponse(404, "not_found", "Scan not found.");
      }

      const status = await session.repository.getStatus(scanId);

      return status
        ? jsonResponse(scanStatusResponseSchema.parse(status))
        : errorResponse(404, "not_found", "Scan not found.");
    } catch (error) {
      return persistenceError(error);
    }
  };
}

export function CARD_INTELLIGENCE_OPTIONS(): Response {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export const productionCardIntelligenceHandlerDependencies: CardIntelligenceHandlerDependencies =
  {
    async authenticate(accessToken) {
      return authenticateCardIntelligenceSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  };
