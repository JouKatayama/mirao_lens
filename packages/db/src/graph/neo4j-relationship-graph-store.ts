import type {
  ConnectionType,
  GraphPerson,
  RelationshipGraphResponse,
} from "@miraio/domain";
import {
  connectionProvenanceSchema,
  connectionTypeSchema,
} from "@miraio/domain";
import neo4j, { type Driver } from "neo4j-driver";

import {
  connectionCandidateLimit,
  emptyRelationshipGraph,
  type GraphSnapshot,
} from "./relationship-graph-snapshot";

/**
 * The Neo4j projection of each user's relationship graph (ADR-0011).
 *
 * Postgres stays the source of truth for ownership, deletion and RLS. Every
 * node here carries `owner_user_id`, and every query is anchored on it: Neo4j
 * has no row-level security, so isolation is this module's job. The
 * projection is disposable — dropping an owner's subgraph loses nothing,
 * because the next read rebuilds it from Postgres.
 */

export class Neo4jGraphStoreError extends Error {
  constructor(readonly operation: string) {
    super(`Neo4j graph operation failed: ${operation}.`);
    this.name = "Neo4jGraphStoreError";
  }
}

export type CypherStatement = Readonly<{
  params: Record<string, unknown>;
  query: string;
}>;

/** The two things the store needs from a driver; faked in unit tests. */
export interface CypherRunner {
  read(statement: CypherStatement): Promise<Record<string, unknown>[]>;
  writeTransaction(statements: readonly CypherStatement[]): Promise<void>;
}

export type Neo4jConfig = Readonly<{
  database?: string;
  password: string;
  uri: string;
  username: string;
}>;

export function createNeo4jDriver(config: Neo4jConfig): Driver {
  return neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.username, config.password),
    { disableLosslessIntegers: true },
  );
}

export function createNeo4jRunner(
  driver: Driver,
  database?: string,
): CypherRunner {
  return {
    async read({ params, query }) {
      const result = await driver.executeQuery(query, params, {
        database,
        routing: neo4j.routing.READ,
      });
      return result.records.map(
        (record) => record.toObject() as Record<string, unknown>,
      );
    },
    async writeTransaction(statements) {
      const session = driver.session({
        database,
        defaultAccessMode: neo4j.session.WRITE,
      });
      try {
        await session.executeWrite(async (tx) => {
          for (const { params, query } of statements) {
            await tx.run(query, params);
          }
        });
      } finally {
        await session.close();
      }
    },
  };
}

/** Idempotent; run once per process before the first projection write. */
export const graphSchemaStatements: readonly CypherStatement[] = [
  {
    params: {},
    query:
      "CREATE INDEX graph_node_owner_id IF NOT EXISTS FOR (n:GraphNode) ON (n.owner_user_id, n.id)",
  },
];

const personProjection =
  "{ id: $alias.id, name: $alias.name, title: $alias.title, company: $alias.company, last_met_at: $alias.last_met_at }";

function projectPerson(alias: string): string {
  return personProjection.replaceAll("$alias", alias);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toGraphPerson(value: unknown): GraphPerson | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const id = readString(row["id"]);
  const name = readString(row["name"]);
  if (!id || name === null) return null;
  return {
    company: readString(row["company"]),
    id,
    last_met_at: readString(row["last_met_at"]),
    name,
    title: readString(row["title"]),
  };
}

function toConnectionType(value: unknown): ConnectionType | null {
  const parsed = connectionTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class Neo4jRelationshipGraphStore {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly runner: CypherRunner) {}

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= this.runner
      .writeTransaction(graphSchemaStatements)
      .catch((error: unknown) => {
        this.schemaReady = null;
        throw error;
      });
    return this.schemaReady;
  }

  async readFingerprint(ownerId: string): Promise<string | null> {
    try {
      const rows = await this.runner.read({
        params: { owner: ownerId },
        query:
          "MATCH (m:GraphNode:GraphMeta {owner_user_id: $owner}) RETURN m.fingerprint AS fingerprint LIMIT 1",
      });
      return readString(rows[0]?.["fingerprint"]);
    } catch {
      throw new Neo4jGraphStoreError("read_fingerprint");
    }
  }

  /**
   * Replaces the owner's projection with the snapshot, in one transaction, so
   * a reader never sees half a graph.
   */
  async replaceOwnerGraph(
    ownerId: string,
    snapshot: GraphSnapshot,
    fingerprint: string,
  ): Promise<void> {
    const owner = { owner: ownerId };

    try {
      await this.ensureSchema();
      await this.runner.writeTransaction([
        ...deleteOwnerStatements(ownerId),
        {
          params: {
            ...owner,
            people: snapshot.people.map((person) => ({
              company: person.company,
              id: person.id,
              last_met_at: person.last_met_at,
              name: person.name,
              title: person.title,
            })),
          },
          query: `UNWIND $people AS p
            CREATE (:GraphNode:Person {owner_user_id: $owner, id: p.id, name: p.name,
              title: p.title, company: p.company, last_met_at: p.last_met_at})`,
        },
        {
          params: { ...owner, ids: [...snapshot.organizationIds] },
          query: `UNWIND $ids AS id
            CREATE (:GraphNode:Organization {owner_user_id: $owner, id: id})`,
        },
        {
          params: { ...owner, events: [...snapshot.events] },
          query: `UNWIND $events AS e
            CREATE (:GraphNode:Event {owner_user_id: $owner, id: e.id, name: e.name})`,
        },
        {
          params: { ...owner, rows: [...snapshot.worksAt] },
          query: `UNWIND $rows AS r
            MATCH (p:GraphNode:Person {owner_user_id: $owner, id: r.person_id})
            MATCH (o:GraphNode:Organization {owner_user_id: $owner, id: r.organization_id})
            MERGE (p)-[:WORKS_AT]->(o)`,
        },
        {
          params: { ...owner, rows: [...snapshot.metAt] },
          query: `UNWIND $rows AS r
            MATCH (p:GraphNode:Person {owner_user_id: $owner, id: r.person_id})
            MATCH (e:GraphNode:Event {owner_user_id: $owner, id: r.event_id})
            MERGE (p)-[:MET_AT]->(e)`,
        },
        {
          params: {
            ...owner,
            rows: snapshot.connections
              .filter((edge) => edge.approved)
              .map((edge) => ({
                from: edge.from_person_id,
                id: edge.id,
                provenance: edge.provenance,
                to: edge.to_person_id,
                type: edge.connection_type,
              })),
          },
          query: `UNWIND $rows AS c
            MATCH (a:GraphNode:Person {owner_user_id: $owner, id: c.from})
            MATCH (b:GraphNode:Person {owner_user_id: $owner, id: c.to})
            CREATE (a)-[:CONNECTED {id: c.id, type: c.type, provenance: c.provenance}]->(b)`,
        },
        {
          params: { ...owner, fingerprint },
          query: `CREATE (:GraphNode:GraphMeta {owner_user_id: $owner,
            fingerprint: $fingerprint, synced_at: toString(datetime())})`,
        },
      ]);
    } catch {
      throw new Neo4jGraphStoreError("replace_owner_graph");
    }
  }

  /** Removes everything held for the owner. Used on scan and account deletion. */
  async deleteOwnerGraph(ownerId: string): Promise<void> {
    try {
      await this.runner.writeTransaction(deleteOwnerStatements(ownerId));
    } catch {
      throw new Neo4jGraphStoreError("delete_owner_graph");
    }
  }

  async readGraph(
    ownerId: string,
    personId: string,
    scanId: string,
  ): Promise<RelationshipGraphResponse> {
    const params = { owner: ownerId, person: personId };
    const anchor =
      "MATCH (p:GraphNode:Person {owner_user_id: $owner, id: $person})";

    try {
      const [
        personRows,
        connectionRows,
        hopRows,
        colleagueRows,
        eventRows,
        candidateRows,
      ] = await Promise.all([
        this.runner.read({
          params,
          query: `${anchor} RETURN ${projectPerson("p")} AS person`,
        }),
        this.runner.read({
          params,
          query: `${anchor}
              MATCH (p)-[r:CONNECTED]-(o:GraphNode:Person {owner_user_id: $owner})
              RETURN r.id AS id, r.type AS type, r.provenance AS provenance,
                startNode(r) = p AS outgoing, ${projectPerson("o")} AS person
              ORDER BY o.name`,
        }),
        // Two hops: people a direct connection is connected to, excluding
        // the person themself and anyone already directly connected.
        this.runner.read({
          params,
          query: `${anchor}
              MATCH (p)-[:CONNECTED]-(v:GraphNode:Person {owner_user_id: $owner})
                    -[r:CONNECTED]-(f:GraphNode:Person {owner_user_id: $owner})
              WHERE f <> p AND NOT (p)-[:CONNECTED]-(f)
              WITH f, collect({via: ${projectPerson("v")}, type: r.type})[0] AS first
              RETURN ${projectPerson("f")} AS person, first.via AS via, first.type AS type
              ORDER BY f.name
              LIMIT 20`,
        }),
        this.runner.read({
          params,
          query: `${anchor}
              MATCH (p)-[:WORKS_AT]->(:GraphNode:Organization {owner_user_id: $owner})
                    <-[:WORKS_AT]-(c:GraphNode:Person {owner_user_id: $owner})
              WHERE c <> p
              RETURN DISTINCT ${projectPerson("c")} AS person, c.last_met_at AS met
              ORDER BY met DESC`,
        }),
        this.runner.read({
          params,
          query: `${anchor}
              MATCH (p)-[:MET_AT]->(e:GraphNode:Event {owner_user_id: $owner})
              RETURN DISTINCT e.id AS id, e.name AS name`,
        }),
        this.runner.read({
          params: { ...params, limit: connectionCandidateLimit },
          query: `MATCH (c:GraphNode:Person {owner_user_id: $owner})
              WHERE c.id <> $person
              RETURN ${projectPerson("c")} AS person
              ORDER BY coalesce(c.last_met_at, '') DESC
              LIMIT toInteger($limit)`,
        }),
      ]);

      const person = toGraphPerson(personRows[0]?.["person"]);

      if (!person) {
        return emptyRelationshipGraph(scanId);
      }

      return {
        candidates: candidateRows.flatMap((row) => {
          const candidate = toGraphPerson(row["person"]);
          return candidate ? [candidate] : [];
        }),
        colleagues: colleagueRows.flatMap((row) => {
          const colleague = toGraphPerson(row["person"]);
          return colleague ? [colleague] : [];
        }),
        connections: connectionRows.flatMap((row) => {
          const other = toGraphPerson(row["person"]);
          const type = toConnectionType(row["type"]);
          const provenance = connectionProvenanceSchema.safeParse(
            row["provenance"],
          );
          const id = readString(row["id"]);
          return other && type && provenance.success && id
            ? [
                {
                  connection_type: type,
                  direction: row["outgoing"] === true ? "outgoing" : "incoming",
                  id,
                  person: other,
                  provenance: provenance.data,
                } as const,
              ]
            : [];
        }),
        events: eventRows.flatMap((row) => {
          const id = readString(row["id"]);
          const name = readString(row["name"]);
          return id && name !== null ? [{ id, name }] : [];
        }),
        person,
        scan_id: scanId,
        second_hop: hopRows.flatMap((row) => {
          const far = toGraphPerson(row["person"]);
          const via = toGraphPerson(row["via"]);
          const type = toConnectionType(row["type"]);
          return far && via && type
            ? [{ connection_type: type, person: far, via }]
            : [];
        }),
      };
    } catch {
      throw new Neo4jGraphStoreError("read_graph");
    }
  }
}

function deleteOwnerStatements(ownerId: string): CypherStatement[] {
  return [
    {
      params: { owner: ownerId },
      query: "MATCH (n:GraphNode {owner_user_id: $owner}) DETACH DELETE n",
    },
  ];
}
