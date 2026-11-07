import {
  connectionProvenanceSchema,
  connectionTypeSchema,
  toStoredConnection,
  type ConnectionCreateRequest,
  type ConnectionEdge,
  type GraphPerson,
  type RelationshipGraphResponse,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";
import {
  assembleRelationshipGraph,
  emptyRelationshipGraph,
  type GraphSnapshot,
} from "./graph/relationship-graph-snapshot";

export class RelationshipGraphRepositoryError extends Error {
  constructor(readonly operation: string) {
    super(`Relationship graph persistence failed: ${operation}.`);
    this.name = "RelationshipGraphRepositoryError";
  }
}

export type AuthenticatedRelationshipGraphSession = Readonly<{
  repository: RelationshipGraphRepository;
  userId: string;
}>;

export async function authenticateRelationshipGraphSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedRelationshipGraphSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new RelationshipGraphRepository(client, data.user.id),
    userId: data.user.id,
  };
}

/**
 * One user's network is small in the pilot, so it is read whole and assembled
 * in memory rather than traversed in SQL. The bounds keep a heavy user from
 * turning one read into an unbounded one; past them, the oldest rows drop out.
 */
export const relationshipGraphReadLimit = 1000;

export type ConnectionCreateResult =
  | Readonly<{ status: "created"; id: string }>
  | Readonly<{ status: "duplicate" | "no_person" | "unknown_person" }>;

type CardRow = Readonly<{
  company: string | null;
  organization_id: string | null;
  person_id: string | null;
  scan_id: string | null;
}>;

export class RelationshipGraphRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  /** The person the scan's card resolved to, if identity resolution found one. */
  async getScanPersonId(scanId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("business_cards")
      .select("person_id")
      .eq("scan_id", scanId)
      .maybeSingle();

    if (error) {
      throw new RelationshipGraphRepositoryError("get_scan_person");
    }

    return data?.person_id ?? null;
  }

  async getGraphForScan(scanId: string): Promise<RelationshipGraphResponse> {
    const personId = await this.getScanPersonId(scanId);

    // No resolved person means nothing to link. Guessing by name would draw
    // edges between strangers.
    if (!personId) {
      return emptyRelationshipGraph(scanId);
    }

    return assembleRelationshipGraph(
      await this.readSnapshot(),
      personId,
      scanId,
    );
  }

  /**
   * The owner's whole graph as Postgres records it: the input to both the
   * Neo4j projection and the in-memory fallback (ADR-0011).
   */
  async readSnapshot(): Promise<GraphSnapshot> {
    const [peopleResult, cardResult, edgeResult] = await Promise.all([
      this.client
        .from("people")
        .select("id,name,title")
        .order("updated_at", { ascending: false })
        .limit(relationshipGraphReadLimit),
      this.client
        .from("business_cards")
        .select("person_id,organization_id,company,scan_id")
        .not("person_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(relationshipGraphReadLimit),
      this.client
        .from("person_connections")
        .select(
          "id,from_person_id,to_person_id,connection_type,provenance,approved",
        )
        .eq("approved", true)
        .order("created_at", { ascending: false })
        .limit(relationshipGraphReadLimit),
    ]);

    if (peopleResult.error || cardResult.error || edgeResult.error) {
      throw new RelationshipGraphRepositoryError("get_graph");
    }

    const cards: CardRow[] = cardResult.data ?? [];
    const scanPeople = new Map(
      cards.flatMap((card) =>
        card.scan_id && card.person_id ? [[card.scan_id, card.person_id]] : [],
      ),
    );
    const scanIds = [...scanPeople.keys()];

    const [scanDates, eventLinks] = await Promise.all([
      this.readScanDates(scanIds),
      this.readEventLinks(scanIds),
    ]);
    const people = toGraphPeople(peopleResult.data ?? [], cards, scanDates);
    const personIds = new Set(people.keys());

    const worksAt = uniqueBy(
      cards.flatMap((card) =>
        card.person_id && card.organization_id && personIds.has(card.person_id)
          ? [
              {
                organization_id: card.organization_id,
                person_id: card.person_id,
              },
            ]
          : [],
      ),
      (row) => `${row.person_id}:${row.organization_id}`,
    );

    const metAt = uniqueBy(
      eventLinks.links.flatMap((link) => {
        const personId = scanPeople.get(link.scan_id);
        return personId && personIds.has(personId)
          ? [{ event_id: link.event_id, person_id: personId }]
          : [];
      }),
      (row) => `${row.person_id}:${row.event_id}`,
    );

    const connections = (edgeResult.data ?? []).flatMap(
      (row): ConnectionEdge[] => {
        const type = connectionTypeSchema.safeParse(row.connection_type);
        const provenance = connectionProvenanceSchema.safeParse(row.provenance);
        return type.success &&
          provenance.success &&
          personIds.has(row.from_person_id) &&
          personIds.has(row.to_person_id)
          ? [
              {
                approved: row.approved,
                connection_type: type.data,
                from_person_id: row.from_person_id,
                id: row.id,
                provenance: provenance.data,
                to_person_id: row.to_person_id,
              },
            ]
          : [];
      },
    );

    return {
      connections,
      events: eventLinks.events,
      metAt,
      organizationIds: [...new Set(worksAt.map((row) => row.organization_id))],
      people: [...people.values()],
      worksAt,
    };
  }

  async createConnection(
    scanId: string,
    request: ConnectionCreateRequest,
  ): Promise<ConnectionCreateResult> {
    const personId = await this.getScanPersonId(scanId);

    if (!personId) {
      return { status: "no_person" };
    }

    if (personId === request.other_person_id) {
      return { status: "unknown_person" };
    }

    const stored = toStoredConnection(personId, request);
    const { data, error } = await this.client
      .from("person_connections")
      .insert({
        ...stored,
        approved: true,
        owner_user_id: this.userId,
        provenance: "user",
      })
      .select("id")
      .single();

    if (error) {
      // 23505: the same connection already exists. 23503: the other person is
      // not one of this user's people — RLS hides them, so the key fails.
      if (error.code === "23505") return { status: "duplicate" };
      if (error.code === "23503") return { status: "unknown_person" };
      throw new RelationshipGraphRepositoryError("create_connection");
    }

    return { id: data.id, status: "created" };
  }

  async deleteConnection(connectionId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("person_connections")
      .delete()
      .eq("id", connectionId)
      .select("id");

    if (error) {
      throw new RelationshipGraphRepositoryError("delete_connection");
    }

    return (data ?? []).length > 0;
  }

  /** Approved connections of one person, by the other person's name. */
  async listApprovedConnectionNames(
    personId: string,
  ): Promise<{ connection_type: string; name: string }[]> {
    const { data: edges, error } = await this.client
      .from("person_connections")
      .select("from_person_id,to_person_id,connection_type")
      .eq("approved", true)
      .or(`from_person_id.eq.${personId},to_person_id.eq.${personId}`)
      .limit(50);

    if (error) {
      throw new RelationshipGraphRepositoryError("list_connection_names");
    }

    const otherIds = (edges ?? []).map((edge) =>
      edge.from_person_id === personId
        ? edge.to_person_id
        : edge.from_person_id,
    );

    if (otherIds.length === 0) {
      return [];
    }

    const { data: people, error: peopleError } = await this.client
      .from("people")
      .select("id,name")
      .in("id", otherIds);

    if (peopleError) {
      throw new RelationshipGraphRepositoryError("list_connection_names");
    }

    const names = new Map((people ?? []).map((row) => [row.id, row.name]));

    return (edges ?? []).flatMap((edge) => {
      const otherId =
        edge.from_person_id === personId
          ? edge.to_person_id
          : edge.from_person_id;
      const name = names.get(otherId);
      return name ? [{ connection_type: edge.connection_type, name }] : [];
    });
  }

  private async readScanDates(
    scanIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (scanIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.client
      .from("scans")
      .select("id,created_at")
      .in("id", [...scanIds]);

    if (error) {
      throw new RelationshipGraphRepositoryError("get_scan_dates");
    }

    return new Map((data ?? []).map((row) => [row.id, row.created_at]));
  }

  private async readEventLinks(scanIds: readonly string[]): Promise<{
    events: { id: string; name: string }[];
    links: { event_id: string; scan_id: string }[];
  }> {
    if (scanIds.length === 0) {
      return { events: [], links: [] };
    }

    const { data: links, error } = await this.client
      .from("event_scans")
      .select("event_id,scan_id")
      .in("scan_id", [...scanIds]);

    if (error) {
      throw new RelationshipGraphRepositoryError("get_event_links");
    }

    const eventIds = [...new Set((links ?? []).map((row) => row.event_id))];

    if (eventIds.length === 0) {
      return { events: [], links: [] };
    }

    const { data: events, error: eventError } = await this.client
      .from("events")
      .select("id,name")
      .in("id", eventIds);

    if (eventError) {
      throw new RelationshipGraphRepositoryError("get_events");
    }

    return {
      events: (events ?? []).map((row) => ({ id: row.id, name: row.name })),
      links: links ?? [],
    };
  }
}

function toGraphPeople(
  rows: readonly { id: string; name: string; title: string | null }[],
  cards: readonly CardRow[],
  scanDates: ReadonlyMap<string, string>,
): Map<string, GraphPerson> {
  const latest = new Map<string, { company: string | null; date: string }>();

  for (const card of cards) {
    if (!card.person_id || !card.scan_id) continue;
    const date = scanDates.get(card.scan_id);
    if (!date) continue;
    const current = latest.get(card.person_id);
    if (!current || current.date < date) {
      latest.set(card.person_id, { company: card.company, date });
    }
  }

  return new Map(
    rows.map((row) => {
      const seen = latest.get(row.id);
      return [
        row.id,
        {
          company: seen?.company ?? null,
          id: row.id,
          last_met_at: seen?.date ?? null,
          name: row.name,
          title: row.title,
        },
      ];
    }),
  );
}

function uniqueBy<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    if (!seen.has(key(row))) seen.set(key(row), row);
  }
  return [...seen.values()];
}
