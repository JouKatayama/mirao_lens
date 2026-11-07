import {
  buildConnectionView,
  type ConnectionEdge,
  type GraphPerson,
  type RelationshipGraphResponse,
} from "@miraio/domain";

/**
 * One owner's relationship graph as read from Postgres, the source of truth
 * (ADR-0011). Neo4j holds a projection of exactly this; the Postgres fallback
 * answers from it directly. Only approved connections are included: an
 * unaccepted AI suggestion is not part of the user's graph.
 */
export type GraphSnapshot = Readonly<{
  connections: readonly ConnectionEdge[];
  events: readonly Readonly<{ id: string; name: string }>[];
  metAt: readonly Readonly<{ event_id: string; person_id: string }>[];
  organizationIds: readonly string[];
  people: readonly GraphPerson[];
  worksAt: readonly Readonly<{ organization_id: string; person_id: string }>[];
}>;

export const connectionCandidateLimit = 100;

export function emptyRelationshipGraph(
  scanId: string,
): RelationshipGraphResponse {
  return {
    candidates: [],
    colleagues: [],
    connections: [],
    events: [],
    person: null,
    scan_id: scanId,
    second_hop: [],
  };
}

export function byLastMetDescending(
  left: GraphPerson,
  right: GraphPerson,
): number {
  return (right.last_met_at ?? "").localeCompare(left.last_met_at ?? "");
}

/**
 * A stable digest of the snapshot. The projection in Neo4j is rebuilt only
 * when this changes, so an unchanged network costs no graph writes. Arrays are
 * sorted first: the same data read in a different order is the same graph.
 */
export function fingerprintGraphSnapshot(snapshot: GraphSnapshot): string {
  const sorted = {
    connections: [...snapshot.connections]
      .filter((edge) => edge.approved)
      .map((edge) => [
        edge.id,
        edge.from_person_id,
        edge.to_person_id,
        edge.connection_type,
        edge.provenance,
      ])
      .sort(compareTuples),
    events: snapshot.events.map((e) => [e.id, e.name]).sort(compareTuples),
    metAt: snapshot.metAt
      .map((m) => [m.person_id, m.event_id])
      .sort(compareTuples),
    organizationIds: [...snapshot.organizationIds].sort(),
    people: snapshot.people
      .map((p) => [
        p.id,
        p.name,
        p.title ?? "",
        p.company ?? "",
        p.last_met_at ?? "",
      ])
      .sort(compareTuples),
    worksAt: snapshot.worksAt
      .map((w) => [w.person_id, w.organization_id])
      .sort(compareTuples),
  };

  const text = JSON.stringify(sorted);
  return `${text.length.toString(36)}-${hash53(text, 0)}-${hash53(text, 1)}`;
}

/**
 * cyrb53: a fast 53-bit string hash. The fingerprint only detects change, so
 * cryptographic strength is not needed; two seeds and the length make an
 * accidental collision between two real snapshots vanishingly unlikely.
 */
function hash53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function compareTuples(left: string[], right: string[]): number {
  return left.join("\u0000").localeCompare(right.join("\u0000"));
}

/**
 * The graph around one person, computed in memory. Used when Neo4j is not
 * configured or not reachable, so the screen keeps working either way.
 */
export function assembleRelationshipGraph(
  snapshot: GraphSnapshot,
  personId: string,
  scanId: string,
): RelationshipGraphResponse {
  const people = new Map(snapshot.people.map((person) => [person.id, person]));
  const person = people.get(personId) ?? null;

  if (!person) {
    return emptyRelationshipGraph(scanId);
  }

  const ownOrganizations = new Set(
    snapshot.worksAt
      .filter((row) => row.person_id === personId)
      .map((row) => row.organization_id),
  );
  const colleagueIds = new Set(
    snapshot.worksAt
      .filter(
        (row) =>
          row.person_id !== personId &&
          ownOrganizations.has(row.organization_id),
      )
      .map((row) => row.person_id),
  );

  const eventNames = new Map(snapshot.events.map((e) => [e.id, e.name]));
  const eventIds = new Set(
    snapshot.metAt
      .filter((row) => row.person_id === personId)
      .map((row) => row.event_id),
  );

  const view = buildConnectionView(personId, snapshot.connections, people);

  return {
    candidates: snapshot.people
      .filter((candidate) => candidate.id !== personId)
      .slice()
      .sort(byLastMetDescending)
      .slice(0, connectionCandidateLimit),
    colleagues: [...colleagueIds]
      .map((id) => people.get(id))
      .filter((value): value is GraphPerson => value !== undefined)
      .sort(byLastMetDescending),
    connections: view.connections,
    events: [...eventIds].flatMap((id) => {
      const name = eventNames.get(id);
      return name === undefined ? [] : [{ id, name }];
    }),
    person,
    scan_id: scanId,
    second_hop: view.second_hop,
  };
}
