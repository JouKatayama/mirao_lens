import {
  authenticateRelationshipGraphSession,
  RelationshipGraphRepositoryError,
  type ConnectionCreateResult,
} from "@miraio/db";
import {
  connectionCreateRequestSchema,
  scanRecordSchema,
  type ConnectionCreateRequest,
  type RelationshipGraphResponse,
} from "@miraio/domain";

import {
  authenticateRoute,
  createCorsHeaders,
  createResponder,
  readJsonBody,
  readScanId,
  type ScanRouteContext,
} from "./route-http";
import { readServerSupabaseConfig } from "./server-config";

/**
 * Pilot extension 6 (spec §2.4, ADR-0010): the relationship graph around the
 * person on one scan. Owner-only; no event member can reach it.
 */

const respond = createResponder(createCorsHeaders("GET, POST, DELETE"));

type RelationshipRepositoryPort = Readonly<{
  createConnection(
    scanId: string,
    request: ConnectionCreateRequest,
  ): Promise<ConnectionCreateResult>;
  deleteConnection(connectionId: string): Promise<boolean>;
  getGraphForScan(scanId: string): Promise<RelationshipGraphResponse>;
}>;

type RelationshipSession = Readonly<{
  repository: RelationshipRepositoryPort;
  userId: string;
}>;

export type RelationshipHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<RelationshipSession | null>;
}>;

type Handler = (
  request: Request,
  context: ScanRouteContext,
) => Promise<Response>;

function failure(error: unknown): Response {
  return error instanceof RelationshipGraphRepositoryError
    ? respond.internal("relationship_persistence_failed")
    : respond.internal("relationship_request_failed");
}

export function createGetRelationshipsHandler(
  dependencies: RelationshipHandlerDependencies,
): Handler {
  return async (request, context) => {
    const session = await authenticateRoute(
      request,
      dependencies.authenticate,
      respond,
    );
    if (session instanceof Response) return session;

    const scanId = await readScanId(context);
    if (!scanId) return respond.error(404, "not_found", "Scan not found.");

    try {
      return respond.json(await session.repository.getGraphForScan(scanId));
    } catch (error) {
      return failure(error);
    }
  };
}

export function createPostConnectionHandler(
  dependencies: RelationshipHandlerDependencies,
): Handler {
  return async (request, context) => {
    const session = await authenticateRoute(
      request,
      dependencies.authenticate,
      respond,
    );
    if (session instanceof Response) return session;

    const scanId = await readScanId(context);
    if (!scanId) return respond.error(404, "not_found", "Scan not found.");

    const body = await readJsonBody(request);
    if (!body.ok) {
      return respond.error(
        400,
        "invalid_json",
        "A valid JSON body is required.",
      );
    }

    const parsed = connectionCreateRequestSchema.safeParse(body.body);
    if (!parsed.success) {
      return respond.error(
        400,
        "invalid_connection",
        "Check the connection fields.",
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      );
    }

    try {
      const result = await session.repository.createConnection(
        scanId,
        parsed.data,
      );

      switch (result.status) {
        case "created":
          return respond.json({ id: result.id }, 201);
        case "duplicate":
          return respond.error(
            409,
            "connection_exists",
            "This connection is already recorded.",
          );
        case "no_person":
          return respond.error(
            409,
            "person_unresolved",
            "This card is not linked to a person yet.",
          );
        case "unknown_person":
          return respond.error(
            400,
            "invalid_person",
            "Connections can only join people you have met.",
          );
      }
    } catch (error) {
      return failure(error);
    }
  };
}

export function createDeleteConnectionHandler(
  dependencies: RelationshipHandlerDependencies,
): Handler {
  return async (request, context) => {
    const session = await authenticateRoute(
      request,
      dependencies.authenticate,
      respond,
    );
    if (session instanceof Response) return session;

    const scanId = await readScanId(context);
    if (!scanId) return respond.error(404, "not_found", "Scan not found.");

    // Any UUID shape will do; RLS decides whether the row is the caller's.
    const connectionId = scanRecordSchema.shape.id.safeParse(
      new URL(request.url).searchParams.get("connection_id"),
    );
    if (!connectionId.success) {
      return respond.error(404, "not_found", "Connection not found.");
    }

    try {
      const deleted = await session.repository.deleteConnection(
        connectionId.data,
      );
      return deleted
        ? new Response(null, {
            headers: createCorsHeaders("GET, POST, DELETE"),
            status: 204,
          })
        : respond.error(404, "not_found", "Connection not found.");
    } catch (error) {
      return failure(error);
    }
  };
}

export function RELATIONSHIPS_OPTIONS(): Response {
  return respond.options();
}

export const productionRelationshipHandlerDependencies: RelationshipHandlerDependencies =
  {
    async authenticate(accessToken) {
      return authenticateRelationshipGraphSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  };
