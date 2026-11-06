import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDeleteConnectionHandler,
  createGetRelationshipsHandler,
  createPostConnectionHandler,
  type RelationshipHandlerDependencies,
} from "./relationship-handlers";

const scanId = "00000000-0000-4031-8000-000000000901";
const otherPersonId = "00000000-0000-4031-8000-000000000b02";
const connectionId = "00000000-0000-4031-8000-000000000c01";

function request(
  method: string,
  options: { body?: unknown; query?: string; authenticated?: boolean } = {},
) {
  return new Request(
    `http://api/v1/scans/${scanId}/relationships${options.query ?? ""}`,
    {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers:
        options.authenticated === false
          ? {}
          : { Authorization: "Bearer valid-token" },
      method,
    },
  );
}

const context = (id = scanId) => ({ params: Promise.resolve({ scanId: id }) });

describe("relationship handlers", () => {
  const repository = {
    createConnection: vi.fn(),
    deleteConnection: vi.fn(),
    getGraphForScan: vi.fn(),
  };
  let dependencies: RelationshipHandlerDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({ repository, userId: "u" }),
    };
  });

  it("requires authentication", async () => {
    const res = await createGetRelationshipsHandler(dependencies)(
      request("GET", { authenticated: false }),
      context(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for a malformed scan id", async () => {
    const res = await createGetRelationshipsHandler(dependencies)(
      request("GET"),
      context("nope"),
    );
    expect(res.status).toBe(404);
    expect(repository.getGraphForScan).not.toHaveBeenCalled();
  });

  it("returns the graph", async () => {
    const graph = {
      candidates: [],
      colleagues: [],
      connections: [],
      events: [],
      person: null,
      scan_id: scanId,
      second_hop: [],
    };
    repository.getGraphForScan.mockResolvedValue(graph);

    const res = await createGetRelationshipsHandler(dependencies)(
      request("GET"),
      context(),
    );

    await expect(res.json()).resolves.toEqual(graph);
  });

  it("creates a connection", async () => {
    repository.createConnection.mockResolvedValue({
      id: connectionId,
      status: "created",
    });

    const res = await createPostConnectionHandler(dependencies)(
      request("POST", {
        body: {
          connection_type: "introduced_by",
          other_person_id: otherPersonId,
        },
      }),
      context(),
    );

    expect(res.status).toBe(201);
    expect(repository.createConnection).toHaveBeenCalledWith(scanId, {
      connection_type: "introduced_by",
      direction: "outgoing",
      other_person_id: otherPersonId,
    });
  });

  it("maps a duplicate to 409 and an unknown person to 400", async () => {
    repository.createConnection.mockResolvedValueOnce({ status: "duplicate" });
    repository.createConnection.mockResolvedValueOnce({
      status: "unknown_person",
    });
    const body = { connection_type: "knows", other_person_id: otherPersonId };

    const duplicate = await createPostConnectionHandler(dependencies)(
      request("POST", { body }),
      context(),
    );
    const unknown = await createPostConnectionHandler(dependencies)(
      request("POST", { body }),
      context(),
    );

    expect(duplicate.status).toBe(409);
    expect(unknown.status).toBe(400);
  });

  it("rejects an undeclared connection type", async () => {
    const res = await createPostConnectionHandler(dependencies)(
      request("POST", {
        body: { connection_type: "rival", other_person_id: otherPersonId },
      }),
      context(),
    );
    expect(res.status).toBe(400);
  });

  it("deletes a connection, and 404s for one that is not there", async () => {
    repository.deleteConnection.mockResolvedValueOnce(true);
    repository.deleteConnection.mockResolvedValueOnce(false);
    const query = `?connection_id=${connectionId}`;

    const deleted = await createDeleteConnectionHandler(dependencies)(
      request("DELETE", { query }),
      context(),
    );
    const missing = await createDeleteConnectionHandler(dependencies)(
      request("DELETE", { query }),
      context(),
    );

    expect(deleted.status).toBe(204);
    expect(missing.status).toBe(404);
  });
});
