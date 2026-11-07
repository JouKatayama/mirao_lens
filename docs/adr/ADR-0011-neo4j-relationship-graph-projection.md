# ADR-0011: Neo4j projection for the relationship graph

- Status: Accepted
- Date: 2026-11-07
- Supersedes: the "no separate graph database" decision in ADR-0010

## Context

ADR-0010 kept the relationship graph (spec §2.4, extension 6) in Postgres and
assembled its two-hop view in memory. It rejected a dedicated graph database for
the pilot because a second datastore would duplicate ownership rules, RLS, and
deletion.

The CEO asked for connections to be managed in a graph database. The graph is
the product's long-term core: who introduced whom, shared acquaintances, paths
to a person. These are traversal questions that a graph database answers
natively and that become awkward in SQL as they deepen.

The risks ADR-0010 named still apply. Neo4j has no row-level security. A second
copy of names, titles, companies, and event names is a second place where
deleted personal data could survive.

## Decision

- **Neo4j is the graph query engine. Postgres remains the source of truth.**
  People, cards, events, and connections are still written only to Postgres,
  under the existing RLS, composite foreign keys, and deletion cascades. Neo4j
  holds a per-user projection that can always be rebuilt from Postgres.
- **Projection model.** Every node has the label `GraphNode` and an
  `owner_user_id`. Nodes are `Person`, `Organization`, `Event`, and
  `GraphMeta`. Relationships are `WORKS_AT`, `MET_AT`, and `CONNECTED {id,
type, provenance}`. Only approved connections are projected.
- **Sync on read.** A graph read loads the owner's snapshot from Postgres and
  computes a fingerprint of it. It rebuilds the owner's subgraph in one write
  transaction only when the fingerprint differs from the one stored in
  `GraphMeta`, then answers from Neo4j. Writes never touch Neo4j, so Postgres
  and Neo4j cannot disagree about what is stored. Neo4j can only be behind until
  the next read.
- **Isolation is enforced in code.** Every Cypher statement is anchored on
  `$owner`, and unit tests assert this for every statement. Person ids are
  unique only per owner, so no query may match by id alone.
- **Deletion.** Deleting a scan drops the owner's whole projection (best
  effort; the scan is already gone from Postgres). Deleting an account drops it
  before deleting the account, and fails the request if the drop fails, so a
  retry can finish it.
- **Graceful degradation.** With `NEO4J_URI` unset, or when Neo4j is
  unreachable, the same snapshot is answered in memory (the ADR-0010 path). The
  graph screen never depends on Neo4j being up.
- **Credentials are server-only:** `NEO4J_URI`, `NEO4J_USERNAME`,
  `NEO4J_PASSWORD`, and `NEO4J_DATABASE`. The driver lives in `packages/db` as
  a persistence adapter. Domain contracts stay free of it.
- **Hosting.** The pilot can use Neo4j AuraDB Free or a self-hosted Neo4j 5
  Community. The CI `graph` job tests the projection against a Neo4j 5.26
  Community container.

## Rejected alternatives

- **Connections stored only in Neo4j.** Ownership, deletion cascades, and
  isolation would all move into application code with no database backstop,
  and the follow-up stage and RLS tests would lose their source of truth.
- **Write-through sync on every write path.** Cards, identity resolution,
  events, corrections, and deletions all change the graph. Hooking each one is
  brittle, and a missed hook silently corrupts the projection. Fingerprint
  rebuild-on-read is self-healing.
- **Apache AGE (a graph extension inside Postgres).** It is not available on
  hosted Supabase.

## Consequences

- Each graph read still reads the owner's bounded rows from Postgres (at most
  1,000 per table) to compute the fingerprint. Neo4j adds traversal, not read
  savings. If networks outgrow this, the next step is a cheaper change signal
  (for example, a per-owner version counter maintained by triggers).
- The projection duplicates personal data in Neo4j while it exists. It is
  dropped on scan and account deletion, and an owner who never reads the graph
  again keeps a projection only until their next deletion.
- If Neo4j is unreachable, account deletion fails, and the user has to retry
  once Neo4j is back.
