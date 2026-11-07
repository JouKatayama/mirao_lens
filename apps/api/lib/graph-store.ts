import {
  createNeo4jDriver,
  createNeo4jRunner,
  Neo4jRelationshipGraphStore,
} from "@miraio/db";

import { readNeo4jConfig } from "./server-config";

/**
 * One Neo4j driver per server process: a driver owns a connection pool and is
 * meant to be long-lived, so it is created on first use and reused. Null when
 * NEO4J_URI is not set (ADR-0011).
 */
let cached: { store: Neo4jRelationshipGraphStore | null } | null = null;

export function getRelationshipGraphStore(): Neo4jRelationshipGraphStore | null {
  if (cached) {
    return cached.store;
  }

  const config = readNeo4jConfig(process.env);
  const store = config
    ? new Neo4jRelationshipGraphStore(
        createNeo4jRunner(createNeo4jDriver(config), config.database),
      )
    : null;

  cached = { store };
  return store;
}

/**
 * Drops the owner's projection so nothing deleted from Postgres lingers in
 * Neo4j. The next graph read rebuilds what still exists.
 */
export async function purgeRelationshipGraph(userId: string): Promise<void> {
  await getRelationshipGraphStore()?.deleteOwnerGraph(userId);
}
