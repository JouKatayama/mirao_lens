# ADR-0010: Follow-up decision and relationship graph boundaries

- Status: Accepted
- Date: 2026-11-07

## Context

The product spec §2.4 approves two pilot extensions. In the first, the system
judges whether to follow up after an encounter and prepares a draft up to the
point of approval. In the second, the user's encounters and past connections
are kept as a relationship graph.

Both extensions touch existing locked boundaries:

- §2.2 excludes automatic outreach and Relationship Graph visualization.
  Locked Decision 9 forbids automatic outbound actions, and US-007 forbids
  automatic message sending.
- The proposal names a "Graph DB". A second datastore would duplicate the
  ownership rules, RLS, and deletion cascades that ADR-0002 and ADR-0009 build
  on Supabase Postgres.
- People, organizations, scans, and events already exist as owner-scoped rows.
  Identity resolution already reuses one `people` row across scans
  (`business_cards.person_id`, `business_cards.organization_id`). Most of the
  graph's edges are already stored.

## Decision

### Follow-up recommendation

- A Follow-up Recommendation is its own stage after the Flash Brief. It
  consumes canonical contracts: card facts, reviewed note, Mutual Value,
  Next Action, encounter history, and approved graph connections. It is
  never part of the Fast Path.
- Judging and drafting are separate (ADR-0005). The decision is a typed choice
  among `follow_up`, `hold`, and `no_follow_up`, with a confidence in `[0, 1]`.
  Each reason is labeled Fact or Hypothesis and refers to its inputs. A
  draft is generated only after a `follow_up` decision. The domain contract
  names no provider or model.
- The recommendation is stored per scan, under the scan's owner, using the same
  composite `(scan_id, user_id)` foreign key as other scan children. It is
  deleted with the scan. Its status is `suggested`, then `approved`,
  `edited`, or `dismissed`. Model metadata is recorded the same way as in
  `relationship_analyses`.
- **No outbound path exists.** The server has no mail, messaging, or
  scheduling integration for follow-ups. Approval hands the draft off on the
  device only: copy to the clipboard, or open the OS compose screen or share
  sheet. Locked Decision 9 still holds: the system takes no outbound action.
  The user does.
- The draft's inputs are limited to business-card facts, the reviewed note,
  and the user's approved Personal Context. A Hypothesis is never written into
  a draft as a fact. Raw images, unreviewed transcripts, AI-suggested graph
  connections, and other users' data are excluded.

### Relationship graph

- **The graph is stored in Supabase Postgres. No separate graph database is
  introduced for the pilot.**
- Nodes are the existing `people`, `organizations`, and `events` rows, plus
  the user. No node table is duplicated.
- Derivable edges are not copied. _Met_, _works at_, and _met at_ are read from
  `scans`, `business_cards`, and `event_scans` through an owner-scoped view or
  query. This keeps a single source of truth, and deletion needs no extra
  work.
- Only connections that no scan records get new storage: one owner-scoped
  `person_connections` table. Each row holds two `people` ids owned by the
  same user, enforced with composite foreign keys; a connection type of
  `introduced_by`, `knows`, or `worked_with`; a provenance of `user` or
  `ai_suggestion`; and an approval flag that defaults to false for AI
  suggestions. Deleting either person deletes the row.
- Graph reads are limited to two hops. The repository reads the owner's
  bounded rows (at most 1,000 per table) under RLS and assembles the hops in
  memory; SQL traversal can replace this if a network outgrows it. Reads never
  cross owners. Event team membership (ADR-0009) grants
  no access to connections or derived edges.
- Graph visualization, contacts import, and cross-user merging stay out of
  scope.

### Rejected alternatives

- **A dedicated graph database (Neo4j or similar).** It would add a second
  datastore with its own authentication, ownership rules, and deletion
  handling, plus synchronization from Postgres. That risks owner data leaking
  or outliving a deletion. The pilot's queries are shallow (two hops) and
  small (one user's network), and Postgres handles them. We revisit this if
  measured queries exceed latency budgets, or if multi-hop traversal across
  larger networks becomes a product requirement.
- **Sending follow-ups through Gmail or another mailbox after approval.** This
  is a mailbox OAuth integration that §2.2 excludes. It would make the server
  an outbound actor. It is a separate decision, not part of this ADR.
- **A single generic edge table with polymorphic node references.** Postgres
  could not enforce referential integrity or same-owner checks on it, and it
  would copy edges that are already stored.

## Consequences

- One new scan-child table (follow-up recommendations) and one owner-scoped
  connection table, each with RLS and tests in `supabase/tests`. No new
  infrastructure.
- A new provider-neutral contract in `packages/domain` and a stage adapter in
  `packages/ai`, with deterministic fixtures and a later golden dataset under
  `evals/`.
- Each extension needs its own execution ticket. Item 6 can land before item 5,
  because item 5 reads approved connections as an optional input.
