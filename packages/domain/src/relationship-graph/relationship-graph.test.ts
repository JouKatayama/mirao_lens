import { describe, expect, it } from "vitest";

import {
  buildConnectionView,
  connectionCreateRequestSchema,
  toStoredConnection,
  type ConnectionEdge,
  type GraphPerson,
} from "./relationship-graph";

const ids = {
  a: "00000000-0000-4031-8000-00000000000a",
  b: "00000000-0000-4031-8000-00000000000b",
  c: "00000000-0000-4031-8000-00000000000c",
  d: "00000000-0000-4031-8000-00000000000d",
  e1: "00000000-0000-4031-8000-0000000000e1",
  e2: "00000000-0000-4031-8000-0000000000e2",
  e3: "00000000-0000-4031-8000-0000000000e3",
  e4: "00000000-0000-4031-8000-0000000000e4",
} as const;

function person(id: string, name: string): GraphPerson {
  return { company: null, id, last_met_at: null, name, title: null };
}

const people = new Map<string, GraphPerson>([
  [ids.a, person(ids.a, "A")],
  [ids.b, person(ids.b, "B")],
  [ids.c, person(ids.c, "C")],
  [ids.d, person(ids.d, "D")],
]);

function edge(
  id: string,
  from: string,
  to: string,
  overrides: Partial<ConnectionEdge> = {},
): ConnectionEdge {
  return {
    approved: true,
    connection_type: "knows",
    from_person_id: from,
    id,
    provenance: "user",
    to_person_id: to,
    ...overrides,
  };
}

describe("buildConnectionView", () => {
  it("returns direct connections in both directions", () => {
    const view = buildConnectionView(
      ids.a,
      [
        edge(ids.e1, ids.a, ids.b, { connection_type: "introduced_by" }),
        edge(ids.e2, ids.c, ids.a),
      ],
      people,
    );

    expect(view.connections).toEqual([
      expect.objectContaining({
        connection_type: "introduced_by",
        direction: "outgoing",
        person: people.get(ids.b),
      }),
      expect.objectContaining({
        direction: "incoming",
        person: people.get(ids.c),
      }),
    ]);
  });

  it("finds people two hops away without repeating direct ones", () => {
    const view = buildConnectionView(
      ids.a,
      [
        edge(ids.e1, ids.a, ids.b),
        edge(ids.e2, ids.b, ids.c),
        edge(ids.e3, ids.a, ids.c),
        edge(ids.e4, ids.d, ids.b, { connection_type: "worked_with" }),
      ],
      people,
    );

    expect(view.second_hop).toEqual([
      {
        connection_type: "worked_with",
        person: people.get(ids.d),
        via: people.get(ids.b),
      },
    ]);
  });

  it("ignores unapproved AI suggestions", () => {
    const view = buildConnectionView(
      ids.a,
      [
        edge(ids.e1, ids.a, ids.b, {
          approved: false,
          provenance: "ai_suggestion",
        }),
      ],
      people,
    );

    expect(view.connections).toEqual([]);
  });
});

describe("toStoredConnection", () => {
  it("reverses an incoming introduction", () => {
    const request = connectionCreateRequestSchema.parse({
      connection_type: "introduced_by",
      direction: "incoming",
      other_person_id: ids.b,
    });

    expect(toStoredConnection(ids.a, request)).toEqual({
      connection_type: "introduced_by",
      from_person_id: ids.b,
      to_person_id: ids.a,
    });
  });

  it("keeps symmetric connections in entry order", () => {
    const request = connectionCreateRequestSchema.parse({
      connection_type: "knows",
      direction: "incoming",
      other_person_id: ids.b,
    });

    expect(toStoredConnection(ids.a, request)).toEqual({
      connection_type: "knows",
      from_person_id: ids.a,
      to_person_id: ids.b,
    });
  });
});
