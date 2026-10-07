import {
  authenticateCardIntelligenceSession,
  CardIntelligenceRepositoryError,
  createHubSpotStore,
} from "@miraio/db";

import {
  readServerSupabaseConfig,
  readCleanupConfig,
  ServerConfigurationError,
} from "./server-config";
import {
  decryptTokens,
  HubSpotProvider,
  readHubSpotConfig,
} from "./hubspot-provider";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

type AccountRepositoryPort = Readonly<{
  deleteAccount(userId: string): Promise<void>;
}>;

type AccountSession = Readonly<{
  repository: AccountRepositoryPort;
  userId: string;
}>;

export type AccountHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<AccountSession | null>;
  revokeHubSpot?(userId: string): Promise<void>;
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

export function createDeleteAccountHandler(
  dependencies: AccountHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const accessToken = readBearerToken(request);

    if (!accessToken) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    let session: AccountSession | null;

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
      await dependencies.revokeHubSpot?.(session.userId);
      await session.repository.deleteAccount(session.userId);
      return new Response(null, { headers: corsHeaders, status: 204 });
    } catch (error) {
      return error instanceof CardIntelligenceRepositoryError
        ? internalError("account_delete_failed")
        : internalError("account_delete_failed");
    }
  };
}

export function ACCOUNT_OPTIONS(): Response {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export const productionAccountHandlerDependencies: AccountHandlerDependencies =
  {
    async authenticate(accessToken) {
      return authenticateCardIntelligenceSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
    async revokeHubSpot(userId) {
      const supabase = readCleanupConfig(process.env);
      const store = createHubSpotStore(
        supabase.supabaseUrl,
        supabase.serviceRoleKey,
      );
      const connection = await store.getConnection(userId);
      if (!connection) return;
      const config = readHubSpotConfig(process.env);
      const tokens = decryptTokens(
        connection.encrypted_tokens,
        config.tokenKey,
      );
      await new HubSpotProvider().revoke(config, tokens.refresh_token);
    },
  };
