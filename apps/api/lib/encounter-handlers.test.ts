import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGetEncountersHandler,
  ENCOUNTERS_OPTIONS,
  type EncounterHandlerDependencies,
} from "./encounter-handlers";
import { ServerConfigurationError } from "./server-config";

const scanId = "00000000-0000-4013-8000-000000000901";
const earlierScanId = "00000000-0000-4013-8000-000000000902";

function makeRequest(authenticated = true): Request {
  return new Request(`http://api/v1/scans/${scanId}/encounters`, {
    headers: authenticated ? { Authorization: "Bearer valid-token" } : {},
  });
}

function makeContext(id = scanId) {
  return { params: Promise.resolve({ scanId: id }) };
}

describe("createGetEncountersHandler", () => {
  const repository = { getEncountersForScan: vi.fn() };
  let dependencies: EncounterHandlerDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4013-8000-000000000001",
      }),
    };
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await createGetEncountersHandler(dependencies)(
      makeRequest(false),
      makeContext(),
    );
    expect(res.status).toBe(401);
    expect(repository.getEncountersForScan).not.toHaveBeenCalled();
  });

  it("returns 401 when the session cannot be authenticated", async () => {
    vi.mocked(dependencies.authenticate).mockResolvedValue(null);
    const res = await createGetEncountersHandler(dependencies)(
      makeRequest(),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for a scan id that is not a UUID", async () => {
    const res = await createGetEncountersHandler(dependencies)(
      makeRequest(),
      makeContext("not-a-uuid"),
    );
    expect(res.status).toBe(404);
    expect(repository.getEncountersForScan).not.toHaveBeenCalled();
  });

  it("returns the earlier encounters for the scan", async () => {
    repository.getEncountersForScan.mockResolvedValue([
      {
        created_at: "2026-08-20T04:00:00.000Z",
        meeting_goal: "networking",
        note_excerpt: "採用の話をした",
        scan_id: earlierScanId,
      },
    ]);

    const res = await createGetEncountersHandler(dependencies)(
      makeRequest(),
      makeContext(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          created_at: "2026-08-20T04:00:00.000Z",
          meeting_goal: "networking",
          note_excerpt: "採用の話をした",
          scan_id: earlierScanId,
        },
      ],
      scan_id: scanId,
    });
  });

  it("returns an empty list when the person was never met before", async () => {
    repository.getEncountersForScan.mockResolvedValue([]);

    const res = await createGetEncountersHandler(dependencies)(
      makeRequest(),
      makeContext(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [], scan_id: scanId });
  });

  it("returns 500 without leaking the failure when the read fails", async () => {
    repository.getEncountersForScan.mockRejectedValue(new Error("boom"));

    const res = await createGetEncountersHandler(dependencies)(
      makeRequest(),
      makeContext(),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).not.toContain("boom");
  });

  it("reports an unconfigured service as a server error", async () => {
    vi.mocked(dependencies.authenticate).mockRejectedValue(
      new ServerConfigurationError("SUPABASE_URL"),
    );

    const res = await createGetEncountersHandler(dependencies)(
      makeRequest(),
      makeContext(),
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("service_unconfigured");
  });

  it("answers preflight with the allowed methods", () => {
    const res = ENCOUNTERS_OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
