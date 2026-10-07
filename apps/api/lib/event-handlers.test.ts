import { describe, expect, it, vi } from "vitest";

import {
  createGetEventScansHandler,
  createPostEventHandler,
  createPostEventScanHandler,
  type EventHandlerDependencies,
} from "./event-handlers";

const eventId = "11111111-1111-4111-8111-111111111111";
const scanId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ eventId }) };

function dependencies(attach = vi.fn(async () => true)) {
  const repository = {
    attach,
    create: vi.fn(async (_owner: string, name: string) => ({
      created_at: "2026-11-03T00:00:00Z",
      id: eventId,
      name,
    })),
    list: vi.fn(async () => []),
    listScans: vi.fn(async () => []),
    addMember: vi.fn(async () => undefined),
    removeMember: vi.fn(async () => undefined),
    listMembers: vi.fn(async () => []),
    listSharedEvents: vi.fn(async () => []),
    readTeamItems: vi.fn(async () => []),
  };
  const auth: EventHandlerDependencies = {
    authenticate: vi.fn(async () => ({ repository, userId: "owner-1" })),
  };
  return { auth, repository };
}

function request(url: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: "Bearer test-token",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
  });
}

describe("event handlers", () => {
  it("creates only a validated, trimmed event for the signed-in owner", async () => {
    const { auth, repository } = dependencies();
    const response = await createPostEventHandler(auth)(
      request("https://example.invalid/v1/events", "POST", {
        name: "  展示会  ",
      }),
    );
    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith("owner-1", "展示会");
  });

  it("rejects invalid event names without a write", async () => {
    const { auth, repository } = dependencies();
    const response = await createPostEventHandler(auth)(
      request("https://example.invalid/v1/events", "POST", { name: " " }),
    );
    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("attaches only a valid scan to an owned event", async () => {
    const { auth, repository } = dependencies();
    const response = await createPostEventScanHandler(auth)(
      request("https://example.invalid/v1/events/1/scans", "POST", {
        scan_id: scanId,
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(repository.attach).toHaveBeenCalledWith(eventId, scanId, "owner-1");
  });

  it("does not disclose an event that the repository cannot see", async () => {
    const { auth, repository } = dependencies();
    repository.listScans.mockResolvedValueOnce(null as never);
    const response = await createGetEventScansHandler(auth)(
      request("https://example.invalid/v1/events/1/scans"),
      context,
    );
    expect(response.status).toBe(404);
  });

  it("requires a bearer token", async () => {
    const { auth } = dependencies();
    const response = await createPostEventHandler(auth)(
      new Request("https://example.invalid/v1/events", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });
});
