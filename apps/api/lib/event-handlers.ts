import { authenticateEventSession, EventRepositoryError } from "@miraio/db";
import {
  eventCreateRequestSchema,
  eventScanAttachRequestSchema,
  eventMemberRequestSchema,
  type EventRecord,
  type ScanHistoryItem,
  type EventTeamItem,
} from "@miraio/domain";

import {
  readServerSupabaseConfig,
  ServerConfigurationError,
} from "./server-config";

const headers = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

type EventRepositoryPort = Readonly<{
  create(ownerUserId: string, name: string): Promise<EventRecord>;
  list(): Promise<EventRecord[]>;
  attach(
    eventId: string,
    scanId: string,
    ownerUserId: string,
  ): Promise<boolean>;
  listScans(eventId: string): Promise<ScanHistoryItem[] | null>;
  addMember(
    eventId: string,
    ownerUserId: string,
    memberUserId: string,
  ): Promise<void>;
  removeMember(eventId: string, memberUserId: string): Promise<void>;
  listMembers(eventId: string): Promise<string[]>;
  listSharedEvents(): Promise<
    Array<{ id: string; name: string; owner_user_id: string }>
  >;
  readTeamItems(eventId: string): Promise<EventTeamItem[]>;
}>;

type EventSession = Readonly<{
  repository: EventRepositoryPort;
  userId: string;
}>;

export type EventHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<EventSession | null>;
}>;

type EventRouteContext = Readonly<{ params: Promise<{ eventId: string }> }>;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { headers, status });
}

function failure(status: number, code: string): Response {
  return json(
    { error: { code, message: "The request could not be completed." } },
    status,
  );
}

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(value);
  return match?.[1] ?? null;
}

async function sessionFor(
  request: Request,
  dependencies: EventHandlerDependencies,
): Promise<EventSession | Response> {
  const token = bearer(request);
  if (!token) return failure(401, "unauthorized");
  try {
    return (
      (await dependencies.authenticate(token)) ?? failure(401, "unauthorized")
    );
  } catch (error) {
    return failure(
      500,
      error instanceof ServerConfigurationError
        ? "service_unconfigured"
        : "authentication_unavailable",
    );
  }
}

async function eventIdFor(context: EventRouteContext): Promise<string | null> {
  const { eventId } = await context.params;
  return eventScanAttachRequestSchema.shape.scan_id.safeParse(eventId).success
    ? eventId
    : null;
}

export function createGetEventsHandler(dependencies: EventHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const session = await sessionFor(request, dependencies);
    if (session instanceof Response) return session;
    try {
      return json({ items: await session.repository.list() });
    } catch {
      return failure(500, "event_list_failed");
    }
  };
}

export function createPostEventHandler(dependencies: EventHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const session = await sessionFor(request, dependencies);
    if (session instanceof Response) return session;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure(400, "invalid_json");
    }
    const parsed = eventCreateRequestSchema.safeParse(body);
    if (!parsed.success) return failure(400, "invalid_event");
    try {
      return json(
        await session.repository.create(session.userId, parsed.data.name),
        201,
      );
    } catch {
      return failure(500, "event_create_failed");
    }
  };
}

export function createGetEventScansHandler(
  dependencies: EventHandlerDependencies,
) {
  return async (
    request: Request,
    context: EventRouteContext,
  ): Promise<Response> => {
    const session = await sessionFor(request, dependencies);
    if (session instanceof Response) return session;
    const eventId = await eventIdFor(context);
    if (!eventId) return failure(404, "not_found");
    try {
      const items = await session.repository.listScans(eventId);
      return items === null ? failure(404, "not_found") : json({ items });
    } catch {
      return failure(500, "event_scans_failed");
    }
  };
}

export function createPostEventScanHandler(
  dependencies: EventHandlerDependencies,
) {
  return async (
    request: Request,
    context: EventRouteContext,
  ): Promise<Response> => {
    const session = await sessionFor(request, dependencies);
    if (session instanceof Response) return session;
    const eventId = await eventIdFor(context);
    if (!eventId) return failure(404, "not_found");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure(400, "invalid_json");
    }
    const parsed = eventScanAttachRequestSchema.safeParse(body);
    if (!parsed.success) return failure(400, "invalid_scan");
    try {
      const attached = await session.repository.attach(
        eventId,
        parsed.data.scan_id,
        session.userId,
      );
      return attached
        ? json({ event_id: eventId, scan_id: parsed.data.scan_id })
        : failure(404, "not_found");
    } catch (error) {
      return failure(
        500,
        error instanceof EventRepositoryError
          ? "event_scan_attach_failed"
          : "event_request_failed",
      );
    }
  };
}

export function EVENTS_OPTIONS(): Response {
  return new Response(null, { headers, status: 204 });
}

export function createEventMembersHandler(
  dependencies: EventHandlerDependencies,
) {
  return async (
    request: Request,
    context: EventRouteContext,
  ): Promise<Response> => {
    const session = await sessionFor(request, dependencies);
    if (session instanceof Response) return session;
    const eventId = await eventIdFor(context);
    if (!eventId) return failure(404, "not_found");
    try {
      if ((await session.repository.listScans(eventId)) === null)
        return failure(404, "not_found");
      if (request.method === "GET") {
        return json({
          member_user_ids: await session.repository.listMembers(eventId),
        });
      }
      const body = eventMemberRequestSchema.safeParse(await request.json());
      if (!body.success || body.data.member_user_id === session.userId)
        return failure(400, "invalid_member");
      if (request.method === "POST") {
        await session.repository.addMember(
          eventId,
          session.userId,
          body.data.member_user_id,
        );
      } else if (request.method === "DELETE") {
        await session.repository.removeMember(
          eventId,
          body.data.member_user_id,
        );
      } else return failure(405, "method_not_allowed");
      return json({ member_user_id: body.data.member_user_id });
    } catch {
      return failure(500, "event_member_request_failed");
    }
  };
}

export function createSharedEventsHandler(
  dependencies: EventHandlerDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const session = await sessionFor(request, dependencies);
    if (session instanceof Response) return session;
    try {
      return json({ items: await session.repository.listSharedEvents() });
    } catch {
      return failure(500, "shared_events_failed");
    }
  };
}

export function createSharedEventItemsHandler(
  dependencies: EventHandlerDependencies,
) {
  return async (
    request: Request,
    context: EventRouteContext,
  ): Promise<Response> => {
    const session = await sessionFor(request, dependencies);
    if (session instanceof Response) return session;
    const eventId = await eventIdFor(context);
    if (!eventId) return failure(404, "not_found");
    try {
      return json({ items: await session.repository.readTeamItems(eventId) });
    } catch {
      return failure(500, "shared_event_items_failed");
    }
  };
}

export const productionEventHandlerDependencies: EventHandlerDependencies = {
  async authenticate(accessToken) {
    return authenticateEventSession(
      readServerSupabaseConfig(process.env),
      accessToken,
    );
  },
};
