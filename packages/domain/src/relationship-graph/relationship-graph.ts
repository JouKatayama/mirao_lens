import { z } from "zod";

/**
 * Pilot extension 6 (spec §2.4, ADR-0010): the user's relationship graph.
 *
 * Nodes are the people the user has met. "Met", "works at" and "met at" edges
 * are derived from scans, cards and events; only a connection no scan records
 * is stored. Everything here is the owner's private data and is read-only
 * context: nothing in it is inferred about a person.
 */

export const connectionTypes = [
  "introduced_by",
  "knows",
  "worked_with",
] as const;

export const connectionTypeSchema = z.enum(connectionTypes);
export type ConnectionType = z.infer<typeof connectionTypeSchema>;

export const connectionProvenanceSchema = z.enum(["user", "ai_suggestion"]);
export type ConnectionProvenance = z.infer<typeof connectionProvenanceSchema>;

export const graphPersonSchema = z
  .object({
    company: z.string().nullable(),
    id: z.string().uuid(),
    last_met_at: z.string().nullable(),
    name: z.string(),
    title: z.string().nullable(),
  })
  .strict();

export type GraphPerson = z.infer<typeof graphPersonSchema>;

/**
 * Seen from the person being viewed. For `introduced_by`, "outgoing" means the
 * viewed person was introduced by the other one, and "incoming" means the
 * viewed person introduced them. Symmetric types read the same either way.
 */
export const connectionDirectionSchema = z.enum(["outgoing", "incoming"]);
export type ConnectionDirection = z.infer<typeof connectionDirectionSchema>;

export const graphConnectionSchema = z
  .object({
    connection_type: connectionTypeSchema,
    direction: connectionDirectionSchema,
    id: z.string().uuid(),
    person: graphPersonSchema,
    provenance: connectionProvenanceSchema,
  })
  .strict();

export type GraphConnection = z.infer<typeof graphConnectionSchema>;

export const graphSecondHopSchema = z
  .object({
    connection_type: connectionTypeSchema,
    person: graphPersonSchema,
    via: graphPersonSchema,
  })
  .strict();

export type GraphSecondHop = z.infer<typeof graphSecondHopSchema>;

export const graphEventSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
  })
  .strict();

export const relationshipGraphResponseSchema = z
  .object({
    /** People the user could connect this person to. */
    candidates: z.array(graphPersonSchema),
    /** Others the user has met at the same organization. */
    colleagues: z.array(graphPersonSchema),
    connections: z.array(graphConnectionSchema),
    events: z.array(graphEventSchema),
    /** Null when the card resolved to no person: there is nothing to link. */
    person: graphPersonSchema.nullable(),
    scan_id: z.string().uuid(),
    second_hop: z.array(graphSecondHopSchema),
  })
  .strict();

export type RelationshipGraphResponse = z.infer<
  typeof relationshipGraphResponseSchema
>;

export const connectionCreateRequestSchema = z
  .object({
    connection_type: connectionTypeSchema,
    /**
     * For `introduced_by`: "outgoing" records that the viewed person was
     * introduced by `other_person_id`; "incoming", the reverse.
     */
    direction: connectionDirectionSchema.default("outgoing"),
    other_person_id: z.string().uuid(),
  })
  .strict();

export type ConnectionCreateRequest = z.infer<
  typeof connectionCreateRequestSchema
>;

/** A stored connection, as the graph is assembled from it. */
export type ConnectionEdge = Readonly<{
  approved: boolean;
  connection_type: ConnectionType;
  from_person_id: string;
  id: string;
  provenance: ConnectionProvenance;
  to_person_id: string;
}>;

/** The pilot reads at most two hops (ADR-0010). */
export const secondHopLimit = 20;

/**
 * Assembles the direct connections and the people two hops away from one
 * person. Only approved edges count: an AI suggestion the user has not accepted
 * is not part of their graph. A person reachable directly is never repeated as
 * a second hop, and the viewed person is never their own neighbour.
 */
export function buildConnectionView(
  personId: string,
  edges: readonly ConnectionEdge[],
  people: ReadonlyMap<string, GraphPerson>,
): Readonly<{
  connections: GraphConnection[];
  second_hop: GraphSecondHop[];
}> {
  const approved = edges.filter((edge) => edge.approved);
  const connections: GraphConnection[] = [];
  const direct = new Set<string>();

  for (const edge of approved) {
    const outgoing = edge.from_person_id === personId;
    const incoming = edge.to_person_id === personId;
    if (!outgoing && !incoming) continue;

    const otherId = outgoing ? edge.to_person_id : edge.from_person_id;
    const other = people.get(otherId);
    if (!other) continue;

    direct.add(otherId);
    connections.push({
      connection_type: edge.connection_type,
      direction: outgoing ? "outgoing" : "incoming",
      id: edge.id,
      person: other,
      provenance: edge.provenance,
    });
  }

  const secondHop: GraphSecondHop[] = [];
  const seen = new Set<string>();

  for (const edge of approved) {
    if (secondHop.length >= secondHopLimit) break;

    const fromDirect = direct.has(edge.from_person_id);
    const toDirect = direct.has(edge.to_person_id);
    if (fromDirect === toDirect) continue;

    const viaId = fromDirect ? edge.from_person_id : edge.to_person_id;
    const farId = fromDirect ? edge.to_person_id : edge.from_person_id;
    if (farId === personId || direct.has(farId) || seen.has(farId)) continue;

    const via = people.get(viaId);
    const far = people.get(farId);
    if (!via || !far) continue;

    seen.add(farId);
    secondHop.push({ connection_type: edge.connection_type, person: far, via });
  }

  return { connections, second_hop: secondHop };
}

/**
 * The stored orientation of a connection entered from the viewed person's
 * screen. Symmetric types keep the order they were entered in.
 */
export function toStoredConnection(
  personId: string,
  request: ConnectionCreateRequest,
): Readonly<{
  connection_type: ConnectionType;
  from_person_id: string;
  to_person_id: string;
}> {
  const outgoing =
    request.connection_type !== "introduced_by" ||
    request.direction === "outgoing";

  return {
    connection_type: request.connection_type,
    from_person_id: outgoing ? personId : request.other_person_id,
    to_person_id: outgoing ? request.other_person_id : personId,
  };
}
