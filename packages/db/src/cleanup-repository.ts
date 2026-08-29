import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

const rawImageBucket = "business-card-images";

export class CleanupRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async sweepExpiredRawImages(
    limit: number,
    now: Date,
  ): Promise<{ deleted: number; failed: number }> {
    const { data: rows, error } = await this.client
      .from("scans")
      .select("id,user_id,raw_image_path")
      .not("raw_image_path", "is", null)
      .lt("raw_image_expires_at", now.toISOString())
      .limit(limit);

    if (error) {
      throw new Error(`sweep_query_failed: ${error.message}`);
    }

    let deleted = 0;
    let failed = 0;

    for (const row of rows ?? []) {
      if (!row.raw_image_path) continue;

      const { error: storageError } = await this.client.storage
        .from(rawImageBucket)
        .remove([row.raw_image_path]);

      if (storageError) {
        failed++;
        continue;
      }

      const { error: updateError } = await this.client
        .from("scans")
        .update({ raw_image_path: null })
        .eq("id", row.id)
        .eq("raw_image_path", row.raw_image_path);

      if (updateError) {
        failed++;
      } else {
        deleted++;
      }
    }

    return { deleted, failed };
  }
}

export function createAdminSupabaseClient(
  url: string,
  serviceRoleKey: string,
): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
