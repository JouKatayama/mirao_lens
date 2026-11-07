import { afterAll, describe, expect, it } from "vitest";

import {
  createNeo4jDriver,
  createNeo4jRunner,
  Neo4jRelationshipGraphStore,
} from "./neo4j-relationship-graph-store";
import type { GraphSnapshot } from "./relationship-graph-snapshot";

/**
 * Runs against a real Neo4j (the CI `graph` job starts one). Skipped when
 * NEO4J_TEST_URI is not set, so `pnpm test` needs no graph database.
 */
// packages/db has no Node type definitions; read the environment untyped.
const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env ?? {};
const uri = env["NEO4J_TEST_URI"];

// The CI graph job sets this, so a missing URI fails there instead of
// skipping every test and passing vacuously.
if (env["NEO4J_TEST_REQUIRED"] === "1" && !uri) {
  throw new Error("NEO4J_TEST_URI is required for the graph integration test.");
}
const id = (n: number) =>
  `00000000-0000-4032-8000-${String(n).padStart(12, "0")}`;
const alice = id(9001);
const bob = id(9002);
const scanId = id(900);

function person(n: number, name: string) {
  return { company: null, id: id(n), last_met_at: null, name, title: null };
}

const aliceGraph: GraphSnapshot = {
  connections: [
    {
      approved: true,
      connection_type: "introduced_by",
      from_person_id: id(1),
      id: id(101),
      provenance: "user",
      to_person_id: id(2),
    },
    {
      approved: true,
      connection_type: "worked_with",
      from_person_id: id(3),
      id: id(102),
      provenance: "user",
      to_person_id: id(2),
    },
  ],
  events: [{ id: id(301), name: "展示会" }],
  metAt: [{ event_id: id(301), person_id: id(1) }],
  organizationIds: [id(201)],
  people: [
    person(1, "Synthetic A"),
    person(2, "Synthetic B"),
    person(3, "Synthetic C"),
    person(4, "Synthetic D"),
  ],
  worksAt: [
    { organization_id: id(201), person_id: id(1) },
    { organization_id: id(201), person_id: id(4) },
  ],
};

// Bob's node reuses Alice's person id on purpose: ids are only unique per
// owner, and nothing of Bob's may appear in Alice's answers.
const bobGraph: GraphSnapshot = {
  connections: [],
  events: [],
  metAt: [],
  organizationIds: [],
  people: [person(1, "Bob's contact"), person(5, "Synthetic E")],
  worksAt: [],
};

describe.skipIf(!uri)("Neo4jRelationshipGraphStore against Neo4j", () => {
  const driver = createNeo4jDriver({
    password: env["NEO4J_TEST_PASSWORD"] ?? "",
    uri: uri ?? "bolt://localhost:7687",
    username: env["NEO4J_TEST_USERNAME"] ?? "neo4j",
  });
  const store = new Neo4jRelationshipGraphStore(createNeo4jRunner(driver));

  afterAll(async () => {
    await store.deleteOwnerGraph(alice);
    await store.deleteOwnerGraph(bob);
    await driver.close();
  });

  it("projects and reads one owner's graph", async () => {
    await store.replaceOwnerGraph(alice, aliceGraph, "fp-a1");
    await store.replaceOwnerGraph(bob, bobGraph, "fp-b1");

    const graph = await store.readGraph(alice, id(1), scanId);

    expect(graph.person?.name).toBe("Synthetic A");
    expect(graph.connections).toEqual([
      expect.objectContaining({
        connection_type: "introduced_by",
        direction: "outgoing",
      }),
    ]);
    expect(graph.second_hop.map((hop) => [hop.person.id, hop.via.id])).toEqual([
      [id(3), id(2)],
    ]);
    expect(graph.colleagues.map((c) => c.id)).toEqual([id(4)]);
    expect(graph.events).toEqual([{ id: id(301), name: "展示会" }]);
    expect(graph.candidates.map((c) => c.id).sort()).toEqual([
      id(2),
      id(3),
      id(4),
    ]);
    expect(JSON.stringify(graph)).not.toContain("Bob's contact");
    expect(await store.readFingerprint(alice)).toBe("fp-a1");
  });

  it("replaces rather than accumulates", async () => {
    await store.replaceOwnerGraph(
      alice,
      { ...aliceGraph, connections: [] },
      "fp-a2",
    );

    const graph = await store.readGraph(alice, id(1), scanId);

    expect(graph.connections).toEqual([]);
    expect(await store.readFingerprint(alice)).toBe("fp-a2");
    expect((await store.readGraph(bob, id(1), scanId)).person?.name).toBe(
      "Bob's contact",
    );
  });

  it("deletes only the owner's subgraph", async () => {
    await store.deleteOwnerGraph(alice);

    expect((await store.readGraph(alice, id(1), scanId)).person).toBeNull();
    expect(await store.readFingerprint(alice)).toBeNull();
    expect((await store.readGraph(bob, id(5), scanId)).person?.name).toBe(
      "Synthetic E",
    );
  });
});
