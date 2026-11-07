import type {
  ConnectionCreateRequest,
  RelationshipGraphResponse,
} from "@miraio/domain";

import type {
  ConnectionCreateResult,
  RelationshipGraphRepository,
} from "../relationship-graph-repository";
import {
  Neo4jGraphStoreError,
  type Neo4jRelationshipGraphStore,
} from "./neo4j-relationship-graph-store";
import {
  assembleRelationshipGraph,
  emptyRelationshipGraph,
  fingerprintGraphSnapshot,
} from "./relationship-graph-snapshot";

export type GraphReadSource = "neo4j" | "postgres_fallback";

/**
 * The relationship graph read through Neo4j (ADR-0011).
 *
 * Writes go to Postgres only; the projection follows on the next read. Each
 * read compares the snapshot's fingerprint with the one stored in Neo4j and
 * rebuilds the owner's subgraph only when they differ. If Neo4j cannot be
 * reached, the same snapshot answers in memory, so the screen never depends
 * on the graph database being up.
 */
export class ProjectedRelationshipGraph {
  constructor(
    private readonly postgres: Pick<
      RelationshipGraphRepository,
      | "createConnection"
      | "deleteConnection"
      | "getScanPersonId"
      | "readSnapshot"
    >,
    private readonly store: Pick<
      Neo4jRelationshipGraphStore,
      "readFingerprint" | "readGraph" | "replaceOwnerGraph"
    >,
    private readonly ownerId: string,
    private readonly onRead?: (source: GraphReadSource) => void,
  ) {}

  async getGraphForScan(scanId: string): Promise<RelationshipGraphResponse> {
    const personId = await this.postgres.getScanPersonId(scanId);

    if (!personId) {
      return emptyRelationshipGraph(scanId);
    }

    const snapshot = await this.postgres.readSnapshot();

    try {
      const fingerprint = fingerprintGraphSnapshot(snapshot);
      const stored = await this.store.readFingerprint(this.ownerId);

      if (stored !== fingerprint) {
        await this.store.replaceOwnerGraph(this.ownerId, snapshot, fingerprint);
      }

      const graph = await this.store.readGraph(this.ownerId, personId, scanId);
      this.onRead?.("neo4j");
      return graph;
    } catch (error) {
      if (!(error instanceof Neo4jGraphStoreError)) {
        throw error;
      }

      this.onRead?.("postgres_fallback");
      return assembleRelationshipGraph(snapshot, personId, scanId);
    }
  }

  createConnection(
    scanId: string,
    request: ConnectionCreateRequest,
  ): Promise<ConnectionCreateResult> {
    return this.postgres.createConnection(scanId, request);
  }

  deleteConnection(connectionId: string): Promise<boolean> {
    return this.postgres.deleteConnection(connectionId);
  }
}
