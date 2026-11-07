import { describe, expect, it, vi } from "vitest";

import { Neo4jGraphStoreError } from "./neo4j-relationship-graph-store";
import { ProjectedRelationshipGraph } from "./projected-relationship-graph";
import {
  fingerprintGraphSnapshot,
  type GraphSnapshot,
} from "./relationship-graph-snapshot";

const owner = "00000000-0000-4032-8000-0000000000aa";
const personId = "00000000-0000-4032-8000-000000000001";
const scanId = "00000000-0000-4032-8000-000000000900";

const snapshot: GraphSnapshot = {
  connections: [],
  events: [],
  metAt: [],
  organizationIds: [],
  people: [
    { company: null, id: personId, last_met_at: null, name: "P1", title: null },
  ],
  worksAt: [],
};

const neo4jGraph = {
  candidates: [],
  colleagues: [],
  connections: [],
  events: [],
  person: snapshot.people[0]!,
  scan_id: scanId,
  second_hop: [],
};

function setup(storedFingerprint: string | null) {
  const postgres = {
    createConnection: vi.fn(),
    deleteConnection: vi.fn(),
    getScanPersonId: vi.fn().mockResolvedValue(personId),
    readSnapshot: vi.fn().mockResolvedValue(snapshot),
  };
  const store = {
    readFingerprint: vi.fn().mockResolvedValue(storedFingerprint),
    readGraph: vi.fn().mockResolvedValue(neo4jGraph),
    replaceOwnerGraph: vi.fn().mockResolvedValue(undefined),
  };
  const onRead = vi.fn();
  return {
    graph: new ProjectedRelationshipGraph(postgres, store, owner, onRead),
    onRead,
    postgres,
    store,
  };
}

describe("ProjectedRelationshipGraph", () => {
  it("rebuilds the projection when the fingerprint changed", async () => {
    const { graph, store, onRead } = setup("stale");

    await expect(graph.getGraphForScan(scanId)).resolves.toBe(neo4jGraph);

    expect(store.replaceOwnerGraph).toHaveBeenCalledWith(
      owner,
      snapshot,
      fingerprintGraphSnapshot(snapshot),
    );
    expect(store.readGraph).toHaveBeenCalledWith(owner, personId, scanId);
    expect(onRead).toHaveBeenCalledWith("neo4j");
  });

  it("skips the rebuild when nothing changed", async () => {
    const { graph, store } = setup(fingerprintGraphSnapshot(snapshot));

    await graph.getGraphForScan(scanId);

    expect(store.replaceOwnerGraph).not.toHaveBeenCalled();
  });

  it("answers from Postgres when Neo4j is unreachable", async () => {
    const { graph, store, onRead } = setup(null);
    store.readFingerprint.mockRejectedValue(
      new Neo4jGraphStoreError("read_fingerprint"),
    );

    const result = await graph.getGraphForScan(scanId);

    expect(result.person?.id).toBe(personId);
    expect(onRead).toHaveBeenCalledWith("postgres_fallback");
  });

  it("does not touch Neo4j for an unresolved card", async () => {
    const { graph, postgres, store } = setup(null);
    postgres.getScanPersonId.mockResolvedValue(null);

    const result = await graph.getGraphForScan(scanId);

    expect(result.person).toBeNull();
    expect(store.readFingerprint).not.toHaveBeenCalled();
  });

  it("propagates Postgres failures instead of masking them", async () => {
    const { graph, postgres } = setup(null);
    postgres.readSnapshot.mockRejectedValue(new Error("postgres down"));

    await expect(graph.getGraphForScan(scanId)).rejects.toThrow(
      "postgres down",
    );
  });
});
