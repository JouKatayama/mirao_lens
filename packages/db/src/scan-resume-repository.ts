import {
  scanDatabaseStatusSchema,
  type ScanDatabaseStatus,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

export class ScanResumeRepositoryError extends Error {
  constructor(readonly operation: string) {
    super(`Scan resume persistence failed: ${operation}.`);
    this.name = "ScanResumeRepositoryError";
  }
}

export type ScanPipelineRun = Readonly<{
  createdAt: string;
  id: string;
  stage: string;
  status: string;
}>;

export type ScanResumeState = Readonly<{
  runs: readonly ScanPipelineRun[];
  status: ScanDatabaseStatus;
}>;

/** Stages whose claim cannot recover a dead run by itself; see releaseStaleRun. */
export type ReleasableStage = "company_context" | "mutual_value";

export type AuthenticatedScanResumeSession = Readonly<{
  repository: ScanResumeRepository;
  userId: string;
}>;

export async function authenticateScanResumeSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedScanResumeSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new ScanResumeRepository(client),
    userId: data.user.id,
  };
}

export class ScanResumeRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /** The scan's status and every AI run recorded for it, or null if not owned. */
  async getResumeState(scanId: string): Promise<ScanResumeState | null> {
    const { data: scan, error: scanError } = await this.client
      .from("scans")
      .select("status")
      .eq("id", scanId)
      .maybeSingle();

    if (scanError) {
      throw new ScanResumeRepositoryError("read_scan");
    }

    if (!scan) {
      return null;
    }

    const { data: runs, error: runError } = await this.client
      .from("ai_runs")
      .select("id,stage,status,created_at")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true });

    if (runError) {
      throw new ScanResumeRepositoryError("read_runs");
    }

    return {
      runs: (runs ?? []).map((run) => ({
        createdAt: run.created_at,
        id: run.id,
        stage: run.stage,
        status: run.status,
      })),
      status: scanDatabaseStatusSchema.parse(scan.status),
    };
  }

  /**
   * Fails a run whose worker is gone, through the stage's own failure
   * function so the scan status moves exactly as it would on a real failure.
   *
   * Company context and Mutual Value claim only from the status *before*
   * their stage (card_ready, brief_ready), while their claim moves the scan
   * past it (fast_context, deep_enrichment). A worker cut off mid-stage
   * therefore leaves a scan that no claim can ever pick up again. Card
   * extraction and Flash Brief claim from the status they run in and clean
   * up their own stale runs, so they never need this.
   */
  async releaseStaleRun(
    scanId: string,
    stage: ReleasableStage,
    runId: string,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc(
      stage === "company_context"
        ? "fail_company_context"
        : "fail_mutual_value",
      {
        p_error_code: "stale_claim_released",
        p_run_id: runId,
        p_scan_id: scanId,
      },
    );

    if (error) {
      throw new ScanResumeRepositoryError("release_stale_run");
    }

    return data === true;
  }
}
