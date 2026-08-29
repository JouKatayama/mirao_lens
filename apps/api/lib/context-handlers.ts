import {
  OpenAIPersonalContextStructurer,
  PersonalContextStructuringError,
  type PersonalContextStructurer,
} from "@miraio/ai";
import {
  authenticateDatabaseSession,
  PersonalContextRepositoryError,
} from "@miraio/db";
import {
  personalContextItemSchema,
  personalContextItemUpdateSchema,
  personalContextOnboardingInputSchema,
  type PersonalContextItem,
  type PersonalContextItemUpdate,
  type PersonalContextOnboardingInput,
  type PersonalContextResponse,
  type PersonalContextStructuredOutput,
} from "@miraio/domain";

import {
  readOpenAIPersonalContextConfig,
  readServerSupabaseConfig,
  ServerConfigurationError,
} from "./server-config";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

type ContextRepositoryPort = Readonly<{
  deleteItem(itemId: string): Promise<boolean>;
  getApproved(): Promise<PersonalContextResponse>;
  persistOnboarding(
    input: PersonalContextOnboardingInput,
    output: PersonalContextStructuredOutput,
  ): Promise<PersonalContextItem[]>;
  updateItem(
    itemId: string,
    update: PersonalContextItemUpdate,
  ): Promise<PersonalContextItem | null>;
}>;

type ContextSession = Readonly<{
  repository: ContextRepositoryPort;
  userId: string;
}>;

export type ContextHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<ContextSession | null>;
  createStructurer(): PersonalContextStructurer;
}>;

type ItemRouteContext = Readonly<{
  params: Promise<{ itemId: string }>;
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

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization) {
    return null;
  }

  const [scheme, token, ...rest] = authorization.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
}

async function authenticateRequest(
  request: Request,
  dependencies: ContextHandlerDependencies,
): Promise<ContextSession | Response> {
  const token = readBearerToken(request);

  if (!token) {
    return errorResponse(401, "unauthorized", "Authentication is required.");
  }

  try {
    const session = await dependencies.authenticate(token);

    return (
      session ??
      errorResponse(401, "unauthorized", "Authentication is required.")
    );
  } catch (error) {
    if (error instanceof ServerConfigurationError) {
      return internalError("service_unconfigured");
    }

    return internalError("authentication_unavailable");
  }
}

function internalError(code = "internal_error"): Response {
  return errorResponse(500, code, "The request could not be completed.", {
    correlationId: crypto.randomUUID(),
  });
}

function databaseErrorResponse(error: unknown): Response {
  if (error instanceof PersonalContextRepositoryError) {
    return internalError("database_error");
  }

  return internalError();
}

function structuringErrorResponse(error: unknown): Response {
  if (error instanceof ServerConfigurationError) {
    return errorResponse(
      503,
      "ai_unconfigured",
      "Personal Context suggestions are temporarily unavailable.",
    );
  }

  if (!(error instanceof PersonalContextStructuringError)) {
    return errorResponse(
      503,
      "ai_unavailable",
      "Personal Context suggestions are temporarily unavailable.",
    );
  }

  if (error.code === "rate_limited") {
    return errorResponse(
      429,
      "ai_rate_limited",
      "Please wait before trying again.",
    );
  }

  if (error.code === "invalid_output") {
    return errorResponse(
      502,
      "ai_invalid_output",
      "The suggestions could not be validated. Please try again.",
    );
  }

  return errorResponse(
    503,
    "ai_unavailable",
    "Personal Context suggestions are temporarily unavailable.",
  );
}

export function createGetContextHandler(
  dependencies: ContextHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const session = await authenticateRequest(request, dependencies);

    if (session instanceof Response) {
      return session;
    }

    try {
      return jsonResponse(await session.repository.getApproved());
    } catch (error) {
      return databaseErrorResponse(error);
    }
  };
}

export function createPostOnboardingHandler(
  dependencies: ContextHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const session = await authenticateRequest(request, dependencies);

    if (session instanceof Response) {
      return session;
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

    const parsed = personalContextOnboardingInputSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        400,
        "invalid_request",
        "Check the highlighted fields.",
        {
          details: parsed.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.join("."),
          })),
        },
      );
    }

    let structuredOutput: PersonalContextStructuredOutput;

    try {
      structuredOutput = await dependencies
        .createStructurer()
        .structure(parsed.data);
    } catch (error) {
      return structuringErrorResponse(error);
    }

    try {
      const suggestions = await session.repository.persistOnboarding(
        parsed.data,
        structuredOutput,
      );

      return jsonResponse({ profile: parsed.data.profile, suggestions }, 201);
    } catch (error) {
      return databaseErrorResponse(error);
    }
  };
}

export function createPatchContextItemHandler(
  dependencies: ContextHandlerDependencies,
): (request: Request, context: ItemRouteContext) => Promise<Response> {
  return async (request, context) => {
    const session = await authenticateRequest(request, dependencies);

    if (session instanceof Response) {
      return session;
    }

    const { itemId } = await context.params;
    const itemIdResult = personalContextItemSchema.shape.id.safeParse(itemId);

    if (!itemIdResult.success) {
      return errorResponse(
        404,
        "not_found",
        "Personal Context item not found.",
      );
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

    const update = personalContextItemUpdateSchema.safeParse(body);

    if (!update.success) {
      return errorResponse(
        400,
        "invalid_request",
        "Check the highlighted fields.",
        {
          details: update.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.join("."),
          })),
        },
      );
    }

    try {
      const item = await session.repository.updateItem(
        itemIdResult.data,
        update.data,
      );

      return item
        ? jsonResponse({ item })
        : errorResponse(404, "not_found", "Personal Context item not found.");
    } catch (error) {
      return databaseErrorResponse(error);
    }
  };
}

export function createDeleteContextItemHandler(
  dependencies: ContextHandlerDependencies,
): (request: Request, context: ItemRouteContext) => Promise<Response> {
  return async (request, context) => {
    const session = await authenticateRequest(request, dependencies);

    if (session instanceof Response) {
      return session;
    }

    const { itemId } = await context.params;
    const itemIdResult = personalContextItemSchema.shape.id.safeParse(itemId);

    if (!itemIdResult.success) {
      return errorResponse(
        404,
        "not_found",
        "Personal Context item not found.",
      );
    }

    try {
      return (await session.repository.deleteItem(itemIdResult.data))
        ? new Response(null, { headers: corsHeaders, status: 204 })
        : errorResponse(404, "not_found", "Personal Context item not found.");
    } catch (error) {
      return databaseErrorResponse(error);
    }
  };
}

export function OPTIONS(): Response {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export const productionContextDependencies: ContextHandlerDependencies = {
  async authenticate(accessToken) {
    return authenticateDatabaseSession(
      readServerSupabaseConfig(process.env),
      accessToken,
    );
  },
  createStructurer() {
    return new OpenAIPersonalContextStructurer(
      readOpenAIPersonalContextConfig(process.env),
    );
  },
};
