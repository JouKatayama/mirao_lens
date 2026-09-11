import type { ScanPipelineRun, ScanResumeState } from "@miraio/db";
import { describe, expect, it, vi } from "vitest";

import {
  createPostScanResumeHandler,
  maximumFailedRunsPerStage,
  planScanResume,
  SCAN_RESUME_OPTIONS,
  type ScanResumeHandlerDependencies,
} from "./scan-resume";

const scanId = "00000000-0000-4000-8000-000000000601";
const userId = "00000000-0000-4000-8000-000000000066";
const now = new Date("2026-09-11T12:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}

function run(
  stage: string,
  status: string,
  createdMinutesAgo = 30,
  id = `${stage}-${status}-${createdMinutesAgo}`,
): ScanPipelineRun {
  return { createdAt: minutesAgo(createdMinutesAgo), id, stage, status };
}

function state(
  status: ScanResumeState["status"],
  runs: ScanPipelineRun[] = [],
): ScanResumeState {
  return { runs, status };
}

describe("planScanResume", () => {
  it("has nothing to do for a finished scan", () => {
    expect(planScanResume(state("deep_ready"), now.getTime())).toEqual({
      action: "complete",
      release: null,
    });
  });

  it.each([
    "created",
    "image_uploaded",
    "failed_retryable",
    "failed_terminal",
  ] as const)(
    "refuses a %s scan, which needs the image uploaded again",
    (status) => {
      expect(planScanResume(state(status), now.getTime()).action).toBe(
        "not_resumable",
      );
    },
  );

  it("schedules a card_ready scan whose brief failed", () => {
    const plan = planScanResume(
      state("card_ready", [
        run("card_extraction", "succeeded"),
        run("company_context", "succeeded"),
        run("flash_brief", "failed_retryable"),
      ]),
      now.getTime(),
    );

    expect(plan).toEqual({ action: "schedule", release: null });
  });

  it("schedules a brief_ready scan whose Mutual Value failed", () => {
    expect(
      planScanResume(
        state("brief_ready", [run("mutual_value", "failed_retryable")]),
        now.getTime(),
      ).action,
    ).toBe("schedule");
  });

  it("leaves a scan with a live run alone", () => {
    expect(
      planScanResume(
        state("generating_brief", [run("flash_brief", "running", 1)]),
        now.getTime(),
      ),
    ).toEqual({ action: "running", release: null });
  });

  it("treats a run with an unreadable timestamp as live", () => {
    const unreadable = {
      ...run("mutual_value", "running"),
      createdAt: "not-a-date",
    };

    expect(
      planScanResume(state("deep_enrichment", [unreadable]), now.getTime())
        .action,
    ).toBe("running");
  });

  it("releases a dead company context run that no claim can recover", () => {
    const plan = planScanResume(
      state("fast_context", [run("company_context", "running", 11, "dead")]),
      now.getTime(),
    );

    expect(plan).toEqual({
      action: "schedule",
      release: { runId: "dead", stage: "company_context" },
    });
  });

  it("releases a dead Mutual Value run that no claim can recover", () => {
    const plan = planScanResume(
      state("deep_enrichment", [run("mutual_value", "running", 21, "dead")]),
      now.getTime(),
    );

    expect(plan).toEqual({
      action: "schedule",
      release: { runId: "dead", stage: "mutual_value" },
    });
  });

  it("waits out the database's own stale interval before calling a run dead", () => {
    // claim_mutual_value treats a run as stale after 20 minutes, not 10.
    expect(
      planScanResume(
        state("deep_enrichment", [run("mutual_value", "running", 15)]),
        now.getTime(),
      ).action,
    ).toBe("running");
  });

  it("schedules without releasing a stale brief run, which its claim reclaims", () => {
    expect(
      planScanResume(
        state("generating_brief", [run("flash_brief", "running", 16)]),
        now.getTime(),
      ),
    ).toEqual({ action: "schedule", release: null });
  });

  it("stops scheduling once the awaited stage has failed too often", () => {
    const failures = Array.from({ length: maximumFailedRunsPerStage }, (_, i) =>
      run("flash_brief", "failed_retryable", 30 + i),
    );

    expect(
      planScanResume(state("card_ready", failures), now.getTime()).action,
    ).toBe("retry_limit_reached");
  });

  it("does not count company context failures against a card_ready scan", () => {
    const failures = Array.from({ length: maximumFailedRunsPerStage }, (_, i) =>
      run("company_context", "failed_retryable", 30 + i),
    );

    expect(
      planScanResume(state("card_ready", failures), now.getTime()).action,
    ).toBe("schedule");
  });

  it("still releases a dead run when no retry is left", () => {
    const failures = Array.from({ length: maximumFailedRunsPerStage }, (_, i) =>
      run("mutual_value", "failed_retryable", 40 + i),
    );

    expect(
      planScanResume(
        state("deep_enrichment", [
          ...failures,
          run("mutual_value", "running", 25, "dead"),
        ]),
        now.getTime(),
      ),
    ).toEqual({
      action: "retry_limit_reached",
      release: { runId: "dead", stage: "mutual_value" },
    });
  });
});

function dependencies(
  options: Readonly<{
    releaseError?: unknown;
    resumeState?: ScanResumeState | null;
    session?: null;
  }> = {},
) {
  const repository = {
    getResumeState: vi
      .fn()
      .mockResolvedValue(
        options.resumeState === undefined
          ? state("card_ready", [run("flash_brief", "failed_retryable")])
          : options.resumeState,
      ),
    releaseStaleRun: options.releaseError
      ? vi.fn().mockRejectedValue(options.releaseError)
      : vi.fn().mockResolvedValue(true),
  };
  const value: ScanResumeHandlerDependencies = {
    authenticate: vi
      .fn()
      .mockResolvedValue(
        options.session === null ? null : { repository, userId },
      ),
    now: () => now,
    schedule: vi.fn(),
  };

  return { dependencies: value, repository };
}

function request(authorization: string | null = "Bearer valid-token") {
  return new Request(`http://localhost/v1/scans/${scanId}/resume`, {
    headers: authorization ? { Authorization: authorization } : {},
    method: "POST",
  });
}

function context(id = scanId) {
  return { params: Promise.resolve({ scanId: id }) };
}

describe("POST /v1/scans/:scanId/resume", () => {
  it("requires a bearer token", async () => {
    const { dependencies: value } = dependencies();
    const response = await createPostScanResumeHandler(value)(
      request(null),
      context(),
    );

    expect(response.status).toBe(401);
    expect(value.authenticate).not.toHaveBeenCalled();
  });

  it("rejects an invalid session", async () => {
    const { dependencies: value } = dependencies({ session: null });
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 for a malformed scan ID without reading anything", async () => {
    const { dependencies: value, repository } = dependencies();
    const response = await createPostScanResumeHandler(value)(
      request(),
      context("not-a-uuid"),
    );

    expect(response.status).toBe(404);
    expect(repository.getResumeState).not.toHaveBeenCalled();
  });

  it("returns 404 for a scan the user does not own", async () => {
    const { dependencies: value } = dependencies({ resumeState: null });
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );

    expect(response.status).toBe(404);
    expect(value.schedule).not.toHaveBeenCalled();
  });

  it("schedules the pipeline with the caller's own session", async () => {
    const { dependencies: value } = dependencies();
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      resume: "scheduled",
      scan_id: scanId,
    });
    expect(value.schedule).toHaveBeenCalledWith({
      accessToken: "valid-token",
      scanId,
    });
  });

  it("releases a dead run before scheduling", async () => {
    const { dependencies: value, repository } = dependencies({
      resumeState: state("fast_context", [
        run("company_context", "running", 12, "dead"),
      ]),
    });
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );

    expect(response.status).toBe(202);
    expect(repository.releaseStaleRun).toHaveBeenCalledWith(
      scanId,
      "company_context",
      "dead",
    );
    expect(value.schedule).toHaveBeenCalledOnce();
  });

  it("does not schedule a scan that is still running", async () => {
    const { dependencies: value } = dependencies({
      resumeState: state("generating_brief", [
        run("flash_brief", "running", 1),
      ]),
    });
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ resume: "running" });
    expect(value.schedule).not.toHaveBeenCalled();
  });

  it("reports a finished scan as complete", async () => {
    const { dependencies: value } = dependencies({
      resumeState: state("deep_ready"),
    });
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resume: "complete",
    });
    expect(value.schedule).not.toHaveBeenCalled();
  });

  it("refuses a failed extraction with 409", async () => {
    const { dependencies: value } = dependencies({
      resumeState: state("failed_retryable"),
    });
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "scan_not_resumable" },
    });
  });

  it("refuses with 429 once the retry limit is reached", async () => {
    const { dependencies: value } = dependencies({
      resumeState: state(
        "card_ready",
        Array.from({ length: maximumFailedRunsPerStage }, (_, i) =>
          run("flash_brief", "failed_retryable", 30 + i),
        ),
      ),
    });
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "retry_limit_reached" },
    });
    expect(value.schedule).not.toHaveBeenCalled();
  });

  it("returns a sanitized 500 when releasing fails", async () => {
    const { dependencies: value } = dependencies({
      releaseError: new Error("database detail"),
      resumeState: state("deep_enrichment", [
        run("mutual_value", "running", 25, "dead"),
      ]),
    });
    const response = await createPostScanResumeHandler(value)(
      request(),
      context(),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("scan_resume_failed");
    expect(body).not.toContain("database detail");
    expect(value.schedule).not.toHaveBeenCalled();
  });

  it("answers the CORS preflight", () => {
    const response = SCAN_RESUME_OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST",
    );
  });
});
