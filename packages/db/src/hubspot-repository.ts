import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export function createHubSpotStore(
  url: string,
  serviceRoleKey: string,
): HubSpotStore {
  const client = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return new HubSpotStore(client);
}

export class HubSpotStore {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async saveState(
    hash: string,
    userId: string,
    expiresAt: string,
  ): Promise<void> {
    const { error } = await this.client.from("hubspot_oauth_states").insert({
      state_hash: hash,
      user_id: userId,
      expires_at: expiresAt,
    });
    if (error) throw new Error("hubspot_state_write_failed");
  }

  async consumeState(hash: string): Promise<string | null> {
    const { data, error } = await this.client.rpc(
      "consume_hubspot_oauth_state",
      { p_state_hash: hash },
    );
    if (error) throw new Error("hubspot_state_read_failed");
    return data;
  }

  async saveConnection(
    userId: string,
    hubId: number,
    encryptedTokens: string,
    accessExpiresAt: string,
  ) {
    const { error } = await this.client.from("hubspot_connections").upsert({
      user_id: userId,
      hub_id: hubId,
      encrypted_tokens: encryptedTokens,
      access_expires_at: accessExpiresAt,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("hubspot_connection_write_failed");
  }

  async getConnection(userId: string) {
    const { data, error } = await this.client
      .from("hubspot_connections")
      .select("hub_id,encrypted_tokens,access_expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("hubspot_connection_read_failed");
    return data;
  }

  async deleteConnection(userId: string) {
    const { error } = await this.client
      .from("hubspot_connections")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error("hubspot_connection_delete_failed");
  }

  async hasOwnedScan(userId: string, scanId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("scans")
      .select("id")
      .eq("user_id", userId)
      .eq("id", scanId)
      .maybeSingle();
    if (error) throw new Error("hubspot_scan_read_failed");
    return Boolean(data);
  }

  async saveContactExport(
    userId: string,
    scanId: string,
    hubId: number,
    contactId: string,
  ) {
    const { error: insertError } = await this.client
      .from("hubspot_exports")
      .upsert(
        {
          user_id: userId,
          scan_id: scanId,
          hub_id: hubId,
          contact_id: contactId,
        },
        { onConflict: "user_id,scan_id,hub_id", ignoreDuplicates: true },
      );
    if (insertError) throw new Error("hubspot_export_write_failed");
    const { error } = await this.client
      .from("hubspot_exports")
      .update({ contact_id: contactId })
      .eq("user_id", userId)
      .eq("scan_id", scanId)
      .eq("hub_id", hubId);
    if (error) throw new Error("hubspot_export_write_failed");
  }

  async claimNote(
    userId: string,
    scanId: string,
    hubId: number,
  ): Promise<boolean> {
    const { data, error } = await this.client
      .from("hubspot_exports")
      .update({ note_status: "sending", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("scan_id", scanId)
      .eq("hub_id", hubId)
      .eq("note_status", "none")
      .select("scan_id")
      .maybeSingle();
    if (error) throw new Error("hubspot_note_claim_failed");
    return Boolean(data);
  }

  async markNoteSent(
    userId: string,
    scanId: string,
    hubId: number,
    noteId: string,
  ) {
    const { error } = await this.client
      .from("hubspot_exports")
      .update({
        note_id: noteId,
        note_status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("scan_id", scanId)
      .eq("hub_id", hubId)
      .eq("note_status", "sending");
    if (error) throw new Error("hubspot_note_update_failed");
  }

  async getExport(userId: string, scanId: string, hubId: number) {
    const { data, error } = await this.client
      .from("hubspot_exports")
      .select("contact_id,note_id,note_status")
      .eq("user_id", userId)
      .eq("scan_id", scanId)
      .eq("hub_id", hubId)
      .maybeSingle();
    if (error) throw new Error("hubspot_export_read_failed");
    return data;
  }
}
