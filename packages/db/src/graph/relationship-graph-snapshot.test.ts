import type { GraphPerson } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  assembleRelationshipGraph,
  fingerprintGraphSnapshot,
  type GraphSnapshot,
} from "./relationship-graph-snapshot";

const id = (n: number) =>
  `00000000-0000-4032-8000-${String(n).padStart(12, "0")}`;
const scanId = id(900);

function person(n: number, lastMet: string | null = null): GraphPerson {
  return {
    company: null,
    id: id(n),
    last_met_at: lastMet,
    name: `P${n}`,
    title: null,
  };
}

const snapshot: GraphSnapshot = {
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
      connection_type: "knows",
      from_person_id: id(2),
      id: id(102),
      provenance: "user",
      to_person_id: id(3),
    },
  ],
  events: [{ id: id(301), name: "展示会" }],
  metAt: [{ event_id: id(301), person_id: id(1) }],
  organizationIds: [id(201)],
  people: [
    person(1, "2026-11-01"),
    person(2, "2026-10-01"),
    person(3),
    person(4, "2026-11-05"),
  ],
  worksAt: [
    { organization_id: id(201), person_id: id(1) },
    { organization_id: id(201), person_id: id(4) },
  ],
};

describe("assembleRelationshipGraph", () => {
  it("answers every section from the snapshot", () => {
    const graph = assembleRelationshipGraph(snapshot, id(1), scanId);

    expect(graph.person?.id).toBe(id(1));
    expect(graph.connections.map((c) => c.person.id)).toEqual([id(2)]);
    expect(graph.second_hop.map((h) => [h.person.id, h.via.id])).toEqual([
      [id(3), id(2)],
    ]);
    expect(graph.colleagues.map((c) => c.id)).toEqual([id(4)]);
    expect(graph.events).toEqual([{ id: id(301), name: "展示会" }]);
    expect(graph.candidates.map((c) => c.id)).toEqual([id(4), id(2), id(3)]);
  });

  it("returns an empty graph for a person outside the snapshot", () => {
    expect(
      assembleRelationshipGraph(snapshot, id(99), scanId).person,
    ).toBeNull();
  });
});

describe("fingerprintGraphSnapshot", () => {
  it("ignores row order", () => {
    const reordered: GraphSnapshot = {
      ...snapshot,
      people: [...snapshot.people].reverse(),
      worksAt: [...snapshot.worksAt].reverse(),
    };
    expect(fingerprintGraphSnapshot(reordered)).toBe(
      fingerprintGraphSnapshot(snapshot),
    );
  });

  it("changes when a connection or a name changes", () => {
    const base = fingerprintGraphSnapshot(snapshot);
    expect(
      fingerprintGraphSnapshot({
        ...snapshot,
        connections: snapshot.connections.slice(1),
      }),
    ).not.toBe(base);
    expect(
      fingerprintGraphSnapshot({
        ...snapshot,
        people: snapshot.people.map((p) =>
          p.id === id(1) ? { ...p, name: "Renamed" } : p,
        ),
      }),
    ).not.toBe(base);
  });
});
