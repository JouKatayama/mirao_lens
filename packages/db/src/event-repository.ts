import {
  eventRecordSchema,
  eventTeamItemSchema,
  scanHistoryItemSchema,
  toScanHistoryStatus,
  type EventRecord,
  type EventTeamItem,
  type ScanHistoryItem,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

export class EventRepositoryError extends Error {
  constructor(readonly operation: string) {
    super(`Event persistence failed: ${operation}.`);
    this.name = "EventRepositoryError";
  }
}

export async function authenticateEventSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<{ repository: EventRepository; userId: string } | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { repository: new EventRepository(client), userId: data.user.id };
}

export class EventRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async create(ownerUserId: string, name: string): Promise<EventRecord> {
    const { data, error } = await this.client
      .from("events")
      .insert({ name, owner_user_id: ownerUserId })
      .select("id,name,created_at")
      .single();
    if (error || !data) throw new EventRepositoryError("create");
    return eventRecordSchema.parse(data);
  }

  async list(): Promise<EventRecord[]> {
    const { data, error } = await this.client
      .from("events")
      .select("id,name,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new EventRepositoryError("list");
    return (data ?? []).map((row: unknown) => eventRecordSchema.parse(row));
  }

  async attach(
    eventId: string,
    scanId: string,
    ownerUserId: string,
  ): Promise<boolean> {
    const [event, scan] = await Promise.all([
      this.client.from("events").select("id").eq("id", eventId).maybeSingle(),
      this.client.from("scans").select("id").eq("id", scanId).maybeSingle(),
    ]);
    if (event.error || scan.error)
      throw new EventRepositoryError("attach_read");
    if (!event.data || !scan.data) return false;

    const { error } = await this.client
      .from("event_scans")
      .upsert(
        { event_id: eventId, owner_user_id: ownerUserId, scan_id: scanId },
        { onConflict: "scan_id" },
      );
    if (error) throw new EventRepositoryError("attach_write");
    return true;
  }

  async listScans(eventId: string): Promise<ScanHistoryItem[] | null> {
    const event = await this.client
      .from("events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    if (event.error) throw new EventRepositoryError("list_scans_event");
    if (!event.data) return null;

    const links = await this.client
      .from("event_scans")
      .select("scan_id")
      .eq("event_id", eventId);
    if (links.error) throw new EventRepositoryError("list_scans_links");
    const ids = (links.data ?? []).map(
      (row: { scan_id: string }) => row.scan_id,
    );
    if (ids.length === 0) return [];

    const { data, error } = await this.client
      .from("scans")
      .select(
        "id,created_at,is_favorite,meeting_goal,status,business_cards(name,company,title)",
      )
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new EventRepositoryError("list_scans_records");

    return (data ?? []).map(
      (row: {
        business_cards: unknown;
        created_at: string;
        id: string;
        is_favorite: boolean;
        meeting_goal: string;
        status: string;
      }) => {
        const cards = row.business_cards as
          | Array<{
              name: string | null;
              company: string | null;
              title: string | null;
            }>
          | {
              name: string | null;
              company: string | null;
              title: string | null;
            }
          | null;
        const card = Array.isArray(cards) ? (cards[0] ?? null) : cards;
        return scanHistoryItemSchema.parse({
          card_company: card?.company ?? null,
          card_name: card?.name ?? null,
          card_title: card?.title ?? null,
          created_at: row.created_at,
          is_favorite: row.is_favorite,
          meeting_goal: row.meeting_goal,
          scan_id: row.id,
          status: toScanHistoryStatus(row.status),
        });
      },
    );
  }

  async addMember(eventId: string, ownerUserId: string, memberUserId: string) {
    const { error } = await this.client.from("event_members").insert({
      event_id: eventId,
      owner_user_id: ownerUserId,
      member_user_id: memberUserId,
    });
    if (error) throw new EventRepositoryError("add_member");
  }

  async removeMember(eventId: string, memberUserId: string): Promise<void> {
    const { error } = await this.client
      .from("event_members")
      .delete()
      .eq("event_id", eventId)
      .eq("member_user_id", memberUserId);
    if (error) throw new EventRepositoryError("remove_member");
  }

  async listMembers(eventId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("event_members")
      .select("member_user_id")
      .eq("event_id", eventId);
    if (error) throw new EventRepositoryError("list_members");
    return (data ?? []).map(
      (row: { member_user_id: string }) => row.member_user_id,
    );
  }

  async listSharedEvents(): Promise<
    Array<{ id: string; name: string; owner_user_id: string }>
  > {
    const { data, error } = await this.client.rpc("list_shared_events");
    if (error) throw new EventRepositoryError("list_shared_events");
    return data ?? [];
  }

  async readTeamItems(eventId: string): Promise<EventTeamItem[]> {
    const { data, error } = await this.client.rpc("read_event_team_items", {
      p_event_id: eventId,
    });
    if (error) throw new EventRepositoryError("read_team_items");
    return (data ?? []).map((row: unknown) => eventTeamItemSchema.parse(row));
  }
}
