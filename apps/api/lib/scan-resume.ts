import {
  authenticateScanResumeSession,
  type ReleasableStage,
  type ScanResumeState,
} from "@miraio/db";
import {
  scanRecordSchema,
  scanResumeResponseSchema,
  type ScanDatabaseStatus,
  type ScanResumeResponse,
} from "@miraio/domain";

import { scheduleScanPipeline, type ScanPipelineInput } from "./scan-pipeline";
import {
  readServerSupabaseConfig,
  ServerConfigurationError,
} from "./server-config";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

const minute = 60 * 1000;

/**
 * Age after which a queued or running claim is presumed dead. These mirror the
 * stale-claim intervals inside each stage's claim function, so a run this
 * module calls stale is one the database would also reclaim.
 */
const staleRunAfterMilliseconds: Readonly<Record<string, number>> = {
  card_extraction: 10 * minute,
  company_context: 10 * minute,
  flash_brief: 15 * minute,
  mutual_value: 20 * minute,
};
const defaultStaleRunAfterMilliseconds = 20 * minute;

/**
 * Failed runs a scan may accumulate at the stage it is waiting on before
 * resuming is refused. Every resume can spend provider calls, and a stage that
 * has failed this often is failing for a reason retrying will not fix.
 */
export const maximumFailedRunsPerStage = 3;

// The stage each resumable status is waiting to complete. Company context is
// deliberately absent: its failure degrades into a brief without context, so
// only a failing brief should stop a card_ready scan from resuming.
const awaitedStageByStatus: Partial<Record<ScanDatabaseStatus, string>> = {
  brief_ready: "mutual_value",
  card_ready: "flash_brief",
  deep_enrichment: "mutual_value",
  extracting_card: "card_extraction",
  fast_context: "flash_brief",
  generating_brief: "flash_brief",
};

// A stale run in one of these statuses holds the scan where no claim will
// reach it; see ScanResumeRepository.releaseStaleRun.
const releasableStageByStatus: Partial<
  Record<ScanDatabaseStatus, ReleasableStage>
> = {
  deep_enrichment: "mutual_value",
  fast_context: "company_context",
};

export type ScanResumePlan = Readonly<{
  action:
    | "complete"
    | "not_resumable"
    | "retry_limit_reached"
    | "running"
    | "schedule";
  release: Readonly<{ runId: string; stage: ReleasableStage }> | null;
}>;

export function planScanResume(
  state: ScanResumeState,
  nowMilliseconds: number,
): ScanResumePlan {
  if (state.status === "deep_ready") {
    return { action: "complete", release: null };
  }

  const awaitedStage = awaitedStageByStatus[state.status];

  // Failed extraction needs the image re-uploaded; created/image_uploaded
  // never reached the pipeline. POST /v1/scans covers both.
  if (!awaitedStage) {
    return { action: "not_resumable", release: null };
  }

  const activeRuns = state.runs.filter(
    (run) => run.status === "queued" || run.status === "running",
  );
  const liveRun = activeRuns.find((run) => {
    const age = nowMilliseconds - Date.parse(run.createdAt);
    const staleAfter =
      staleRunAfterMilliseconds[run.stage] ?? defaultStaleRunAfterMilliseconds;

    // An unparseable timestamp gives NaN, which must read as live: releasing
    // a run that is still working would discard its result.
    return !(age >= staleAfter);
  });

  if (liveRun) {
    return { action: "running", release: null };
  }

  const releasableStage = releasableStageByStatus[state.status];
  const staleRun = releasableStage
    ? activeRuns.find((run) => run.stage === releasableStage)
    : undefined;
  const release =
    staleRun && releasableStage
      ? { runId: staleRun.id, stage: releasableStage }
      : null;
  const failedRuns = state.runs.filter(
    (run) =>
      run.stage === awaitedStage &&
      (run.status === "failed_retryable" || run.status === "failed_terminal"),
  ).length;

  // Releasing costs nothing and makes the status truthful again, so it
  // happens even when no new attempt is allowed.
  return failedRuns >= maximumFailedRunsPerStage
    ? { action: "retry_limit_reached", release }
    : { action: "schedule", release };
}

type ScanResumeRepositoryPort = Readonly<{
  getResumeState(scanId: string): Promise<ScanResumeState | null>;
  releaseStaleRun(
    scanId: string,
    stage: ReleasableStage,
    runId: string,
  ): Promise<boolean>;
}>;

type ScanResumeSession = Readonly<{
  repository: ScanResumeRepositoryPort;
  userId: string;
}>;

export type ScanResumeHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<ScanResumeSession | null>;
  now(): Date;
  schedule(input: ScanPipelineInput): void;
}>;

type ScanRouteContext = Readonly<{
  params: Promise<{ scanId: string }>;
}>;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { headers: corsHeaders, status });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  correlationId?: string,
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        ...(correlationId ? { correlation_id: correlationId } : {}),
      },
    },
    status,
  );
}

function internalError(code: string): Response {
  return errorResponse(
    500,
    code,
    "The request could not be completed.",
    crypto.randomUUID(),
  );
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization) {
    return null;
  }

  const [scheme, token, ...rest] = authorization.split(/\s+/);

  return scheme?.toLowerCase() === "bearer" && token && rest.length === 0
    ? token
    : null;
}

function resumeResponse(
  scanId: string,
  resume: ScanResumeResponse["resume"],
  status: number,
): Response {
  return jsonResponse(
    scanResumeResponseSchema.parse({ resume, scan_id: scanId }),
    status,
  );
}

/**
 * POST /v1/scans/:scanId/resume — continue a scan whose pipeline stopped.
 *
 * The pipeline runs inside the upload request, so a failed Flash Brief (which
 * rolls back to card_ready), a failed Mutual Value (back to brief_ready) or a
 * worker cut off mid-stage left the scan where nothing would ever advance it;
 * the client could only keep re-reading the same status. Safe to call at any
 * time: a scan with a live run or nothing left to do is left alone.
 */
export function createPostScanResumeHandler(
  dependencies: ScanResumeHandlerDependencies,
): (request: Request, context: ScanRouteContext) => Promise<Response> {
  return async (request, context) => {
    const accessToken = readBearerToken(request);

    if (!accessToken) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    let session: ScanResumeSession | null;

    try {
      session = await dependencies.authenticate(accessToken);
    } catch (error) {
      return error instanceof ServerConfigurationError
        ? internalError("service_unconfigured")
        : internalError("authentication_unavailable");
    }

    if (!session) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    const { scanId: rawScanId } = await context.params;
    const parsedScanId = scanRecordSchema.shape.id.safeParse(rawScanId);

    if (!parsedScanId.success) {
      return errorResponse(404, "not_found", "Scan not found.");
    }

    const scanId = parsedScanId.data;

    try {
      const state = await session.repository.getResumeState(scanId);

      if (!state) {
        return errorResponse(404, "not_found", "Scan not found.");
      }

      const plan = planScanResume(state, dependencies.now().getTime());

      if (plan.release) {
        await session.repository.releaseStaleRun(
          scanId,
          plan.release.stage,
          plan.release.runId,
        );
      }

      switch (plan.action) {
        case "complete":
          return resumeResponse(scanId, "complete", 200);
        case "running":
          return resumeResponse(scanId, "running", 202);
        case "not_resumable":
          return errorResponse(
            409,
            "scan_not_resumable",
            "This scan needs its card image uploaded again.",
          );
        case "retry_limit_reached":
          return errorResponse(
            429,
            "retry_limit_reached",
            "This scan has failed too many times to retry.",
          );
        case "schedule":
          dependencies.schedule({ accessToken, scanId });
          return resumeResponse(scanId, "scheduled", 202);
      }
    } catch {
      return internalError("scan_resume_failed");
    }
  };
}

export function SCAN_RESUME_OPTIONS(): Response {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export const productionScanResumeDependencies: ScanResumeHandlerDependencies = {
  async authenticate(accessToken) {
    return authenticateScanResumeSession(
      readServerSupabaseConfig(process.env),
      accessToken,
    );
  },
  now: () => new Date(),
  schedule: scheduleScanPipeline,
};
