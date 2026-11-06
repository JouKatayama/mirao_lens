import { scanRecordSchema } from "@miraio/domain";

import { ServerConfigurationError } from "./server-config";

/**
 * Shared response plumbing for the scan-scoped routes added with ML-031. The
 * older handlers each carry their own copy of these helpers; they behave the
 * same way: no-store, sanitized 500s with a correlation id, Bearer-only auth.
 */

export type ScanRouteContext = Readonly<{
  params: Promise<{ scanId: string }>;
}>;

export function createCorsHeaders(methods: string): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };
}

export type RouteResponder = Readonly<{
  error(
    status: number,
    code: string,
    message: string,
    details?: { message: string; path: string }[],
  ): Response;
  internal(code: string): Response;
  json(body: unknown, status?: number): Response;
  options(): Response;
}>;

export function createResponder(
  headers: Record<string, string>,
): RouteResponder {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { headers, status });

  return {
    error(status, code, message, details) {
      return json(
        { error: { code, message, ...(details ? { details } : {}) } },
        status,
      );
    },
    internal(code) {
      return json(
        {
          error: {
            code,
            correlation_id: crypto.randomUUID(),
            message: "The request could not be completed.",
          },
        },
        500,
      );
    },
    json,
    options() {
      return new Response(null, { headers, status: 204 });
    },
  };
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const [scheme, token, ...rest] = authorization.split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && token && rest.length === 0
    ? token
    : null;
}

export async function authenticateRoute<TSession>(
  request: Request,
  authenticate: (accessToken: string) => Promise<TSession | null>,
  respond: RouteResponder,
): Promise<TSession | Response> {
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return respond.error(401, "unauthorized", "Authentication is required.");
  }

  try {
    const session = await authenticate(accessToken);
    return (
      session ??
      respond.error(401, "unauthorized", "Authentication is required.")
    );
  } catch (error) {
    return error instanceof ServerConfigurationError
      ? respond.internal("service_unconfigured")
      : respond.internal("authentication_unavailable");
  }
}

export async function readScanId(
  context: ScanRouteContext,
): Promise<string | null> {
  const { scanId } = await context.params;
  const parsed = scanRecordSchema.shape.id.safeParse(scanId);
  return parsed.success ? parsed.data : null;
}

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { body: await request.json(), ok: true };
  } catch {
    return { ok: false };
  }
}
