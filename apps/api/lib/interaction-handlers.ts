import {
  authenticateInteractionSession,
  InteractionRepositoryError,
} from "@miraio/db";
import {
  nextActionRequestSchema,
  noteRequestSchema,
  scanRecordSchema,
} from "@miraio/domain";

import {
  readServerSupabaseConfig,
  ServerConfigurationError,
} from "./server-config";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

type InteractionRepositoryPort = Readonly<{
  createNextAction(
    scanId: string,
    actionText: string,
    timingText: string | null,
    source: "ai" | "user",
    status: "accepted" | "dismissed",
  ): Promise<{ id: string } | null>;
  upsertNote(
    scanId: string,
    noteText: string,
  ): Promise<{ id: string } | null>;
}>;

type InteractionSession = Readonly<{
  repository: InteractionRepositoryPort;
  userId: string;
}>;

export type InteractionHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<InteractionSession | null>;
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
  dependencies: InteractionHandlerDependencies,
): Promise<InteractionSession | Response> {
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
  return error instanceof InteractionRepositoryError
    ? internalError("interaction_persistence_failed")
    : internalError("interaction_request_failed");
}

export function createPostNoteHandler(
  dependencies: InteractionHandlerDependencies,
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
      return errorResponse(400, "invalid_json", "A valid JSON body is required.");
    }

    const noteRequest = noteRequestSchema.safeParse(body);

    if (!noteRequest.success) {
      return errorResponse(
        400,
        "invalid_note",
        "Check the note_text field.",
        {
          details: noteRequest.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.join("."),
          })),
        },
      );
    }

    try {
      const row = await session.repository.upsertNote(
        scanId,
        noteRequest.data.note_text,
      );

      if (!row) {
        return errorResponse(404, "not_found", "Scan not found.");
      }

      return jsonResponse({
        id: row.id,
        note_text: noteRequest.data.note_text,
        scan_id: scanId,
      });
    } catch (error) {
      return persistenceError(error);
    }
  };
}

export function createPostNextActionHandler(
  dependencies: InteractionHandlerDependencies,
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
      return errorResponse(400, "invalid_json", "A valid JSON body is required.");
    }

    const actionRequest = nextActionRequestSchema.safeParse(body);

    if (!actionRequest.success) {
      return errorResponse(
        400,
        "invalid_next_action",
        "Check the request fields.",
        {
          details: actionRequest.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.join("."),
          })),
        },
      );
    }

    try {
      const row = await session.repository.createNextAction(
        scanId,
        actionRequest.data.action_text,
        actionRequest.data.timing_text ?? null,
        actionRequest.data.source,
        actionRequest.data.status,
      );

      if (!row) {
        return errorResponse(404, "not_found", "Scan not found.");
      }

      return jsonResponse(
        {
          action_text: actionRequest.data.action_text,
          id: row.id,
          scan_id: scanId,
          source: actionRequest.data.source,
          status: actionRequest.data.status,
          timing_text: actionRequest.data.timing_text ?? null,
        },
        201,
      );
    } catch (error) {
      return persistenceError(error);
    }
  };
}

export function INTERACTION_OPTIONS(): Response {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export const productionInteractionHandlerDependencies: InteractionHandlerDependencies =
  {
    async authenticate(accessToken) {
      return authenticateInteractionSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  };
