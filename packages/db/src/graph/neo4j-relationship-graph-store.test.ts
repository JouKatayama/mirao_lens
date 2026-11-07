import { describe, expect, it } from "vitest";

import {
  Neo4jGraphStoreError,
  Neo4jRelationshipGraphStore,
  type CypherRunner,
  type CypherStatement,
} from "./neo4j-relationship-graph-store";
import type { GraphSnapshot } from "./relationship-graph-snapshot";

const owner = "00000000-0000-4032-8000-0000000000aa";
const personId = "00000000-0000-4032-8000-000000000001";
const scanId = "00000000-0000-4032-8000-000000000900";

function fakeRunner(reads: Record<string, unknown>[][] = []) {
  const readStatements: CypherStatement[] = [];
  const writes: CypherStatement[][] = [];
  const runner: CypherRunner = {
    async read(statement) {
      readStatements.push(statement);
      return reads.shift() ?? [];
    },
    async writeTransaction(statements) {
      writes.push([...statements]);
    },
  };
  return { readStatements, runner, writes };
}

const snapshot: GraphSnapshot = {
  connections: [
    {
      approved: true,
      connection_type: "knows",
      from_person_id: personId,
      id: "00000000-0000-4032-8000-000000000101",
      provenance: "user",
      to_person_id: "00000000-0000-4032-8000-000000000002",
    },
  ],
  events: [],
  metAt: [],
  organizationIds: [],
  people: [],
  worksAt: [],
};

describe("Neo4jRelationshipGraphStore", () => {
  it("anchors every projection statement on the owner", async () => {
    const { runner, writes } = fakeRunner();
    await new Neo4jRelationshipGraphStore(runner).replaceOwnerGraph(
      owner,
      snapshot,
      "fp",
    );

    const projection = writes.at(-1) ?? [];
    expect(projection[0]?.query).toContain("DETACH DELETE");
    for (const statement of projection) {
      expect(statement.query).toContain("$owner");
      expect(statement.params["owner"]).toBe(owner);
    }
  });

  it("anchors every read on the owner", async () => {
    const { readStatements, runner } = fakeRunner();
    await new Neo4jRelationshipGraphStore(runner).readGraph(
      owner,
      personId,
      scanId,
    );

    expect(readStatements).toHaveLength(6);
    for (const statement of readStatements) {
      expect(statement.query).toContain("owner_user_id: $owner");
      expect(statement.params["owner"]).toBe(owner);
    }
  });

  it("maps rows into the graph response", async () => {
    const p1 = {
      company: "Example Co",
      id: personId,
      last_met_at: null,
      name: "P1",
      title: null,
    };
    const p2 = {
      company: null,
      id: "00000000-0000-4032-8000-000000000002",
      last_met_at: "2026-11-01",
      name: "P2",
      title: null,
    };
    const { runner } = fakeRunner([
      [{ person: p1 }],
      [
        {
          id: "00000000-0000-4032-8000-000000000101",
          outgoing: false,
          person: p2,
          provenance: "user",
          type: "introduced_by",
        },
      ],
      [],
      [],
      [{ id: "00000000-0000-4032-8000-000000000301", name: "展示会" }],
      [{ person: p2 }],
    ]);

    const graph = await new Neo4jRelationshipGraphStore(runner).readGraph(
      owner,
      personId,
      scanId,
    );

    expect(graph.person).toEqual(p1);
    expect(graph.connections).toEqual([
      {
        connection_type: "introduced_by",
        direction: "incoming",
        id: "00000000-0000-4032-8000-000000000101",
        person: p2,
        provenance: "user",
      },
    ]);
    expect(graph.events).toHaveLength(1);
    expect(graph.candidates).toEqual([p2]);
  });

  it("wraps driver failures", async () => {
    const runner: CypherRunner = {
      read: () => Promise.reject(new Error("connection refused")),
      writeTransaction: () => Promise.reject(new Error("connection refused")),
    };
    const store = new Neo4jRelationshipGraphStore(runner);

    await expect(store.readFingerprint(owner)).rejects.toBeInstanceOf(
      Neo4jGraphStoreError,
    );
    await expect(store.deleteOwnerGraph(owner)).rejects.toBeInstanceOf(
      Neo4jGraphStoreError,
    );
  });
});
