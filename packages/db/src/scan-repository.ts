import {
  scanRecordSchema,
  type MeetingGoal,
  type ScanImageContentType,
  type ScanRecord,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

const scanColumns =
  "id,status,meeting_goal,raw_image_path,raw_image_expires_at" as const;
const rawImageBucket = "business-card-images";

export type ScanRepositoryErrorCode =
  "conflict" | "database_error" | "storage_error";

export class ScanRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: ScanRepositoryErrorCode = "database_error",
  ) {
    super(`Scan persistence operation failed: ${operation}.`);
    this.name = "ScanRepositoryError";
  }
}

export type ScanReservationInput = Readonly<{
  expiresAt: string;
  meetingGoal: MeetingGoal;
  rawImagePath: string;
  scanId: string;
}>;

export type ScanReservation = Readonly<{
  needsUpload: boolean;
  record: ScanRecord;
  replayed: boolean;
}>;

export type AuthenticatedScanDatabaseSession = Readonly<{
  repository: ScanRepository;
  userId: string;
}>;

function mapScan(row: {
  id: string;
  meeting_goal: string;
  raw_image_expires_at: string | null;
  raw_image_path: string | null;
  status: string;
}): ScanRecord {
  return scanRecordSchema.parse(row);
}

function reservationFromExisting(
  record: ScanRecord,
  input: ScanReservationInput,
): ScanReservation {
  if (
    record.meeting_goal !== input.meetingGoal ||
    record.raw_image_path !== input.rawImagePath
  ) {
    throw new ScanRepositoryError("reserve_scan", "conflict");
  }

  return {
    needsUpload:
      record.status === "created" || record.status === "failed_retryable",
    record,
    replayed: true,
  };
}

export async function authenticateScanDatabaseSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedScanDatabaseSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new ScanRepository(client, data.user.id),
    userId: data.user.id,
  };
}

export class ScanRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  private async findOwned(scanId: string): Promise<ScanRecord | null> {
    const { data, error } = await this.client
      .from("scans")
      .select(scanColumns)
      .eq("id", scanId)
      .maybeSingle();

    if (error) {
      throw new ScanRepositoryError("read_scan");
    }

    return data ? mapScan(data) : null;
  }

  private async refreshRetryExpiration(
    reservation: ScanReservation,
    expiresAt: string,
  ): Promise<ScanReservation> {
    if (!reservation.needsUpload) {
      return reservation;
    }

    const { data, error } = await this.client
      .from("scans")
      .update({ raw_image_expires_at: expiresAt })
      .eq("id", reservation.record.id)
      .select(scanColumns)
      .maybeSingle();

    if (error || !data) {
      throw new ScanRepositoryError("refresh_retry_expiration");
    }

    return { ...reservation, record: mapScan(data) };
  }

  async reserve(input: ScanReservationInput): Promise<ScanReservation> {
    const existing = await this.findOwned(input.scanId);

    if (existing) {
      return this.refreshRetryExpiration(
        reservationFromExisting(existing, input),
        input.expiresAt,
      );
    }

    const { data, error } = await this.client
      .from("scans")
      .insert({
        id: input.scanId,
        meeting_goal: input.meetingGoal,
        raw_image_expires_at: input.expiresAt,
        raw_image_path: input.rawImagePath,
        status: "created",
        user_id: this.userId,
      })
      .select(scanColumns)
      .single();

    if (error) {
      if (error.code === "23505") {
        const concurrent = await this.findOwned(input.scanId);

        if (concurrent) {
          return this.refreshRetryExpiration(
            reservationFromExisting(concurrent, input),
            input.expiresAt,
          );
        }

        throw new ScanRepositoryError("reserve_scan", "conflict");
      }

      throw new ScanRepositoryError("reserve_scan");
    }

    return { needsUpload: true, record: mapScan(data), replayed: false };
  }

  async uploadRawImage(
    rawImagePath: string,
    bytes: ArrayBuffer,
    contentType: ScanImageContentType,
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(rawImageBucket)
      .upload(rawImagePath, bytes, {
        cacheControl: "0",
        contentType,
        upsert: true,
      });

    if (error) {
      throw new ScanRepositoryError("upload_raw_image", "storage_error");
    }
  }

  async completeUpload(scanId: string): Promise<ScanRecord> {
    const { data, error } = await this.client
      .from("scans")
      .update({ status: "extracting_card" })
      .eq("id", scanId)
      .select(scanColumns)
      .maybeSingle();

    if (error || !data) {
      throw new ScanRepositoryError("complete_upload");
    }

    return mapScan(data);
  }

  async markUploadFailed(scanId: string): Promise<void> {
    const { error } = await this.client
      .from("scans")
      .update({ status: "failed_retryable" })
      .eq("id", scanId);

    if (error) {
      throw new ScanRepositoryError("mark_upload_failed");
    }
  }
}
