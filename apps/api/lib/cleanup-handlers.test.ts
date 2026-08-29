import { describe, expect, it, vi } from "vitest";

import {
  createPostCleanupHandler,
  type CleanupHandlerDependencies,
} from "./cleanup-handlers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDeps(
  overrides: Partial<{
    secretMatches: boolean;
    sweepResult: { deleted: number; failed: number };
    sweepThrows: Error;
  }> = {},
): CleanupHandlerDependencies {
  return {
    verifySecret: vi.fn().mockReturnValue(overrides.secretMatches ?? true),
    sweepExpiredImages: overrides.sweepThrows
      ? vi.fn().mockRejectedValue(overrides.sweepThrows)
      : vi
          .fn()
          .mockResolvedValue(
            overrides.sweepResult ?? { deleted: 3, failed: 0 },
          ),
  };
}

function makeRequest(secret?: string): Request {
  return new Request(
    "http://localhost/api/internal/cleanup-expired-scans",
    {
      method: "POST",
      headers:
        secret !== undefined ? { "x-cleanup-secret": secret } : {},
    },
  );
}

// ─── POST /api/internal/cleanup-expired-scans ────────────────────────────────

describe("createPostCleanupHandler", () => {
  it("returns 401 when x-cleanup-secret header is absent", async () => {
    const handler = createPostCleanupHandler(
      makeDeps({ secretMatches: false }),
    );
    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when the secret does not match", async () => {
    const handler = createPostCleanupHandler(
      makeDeps({ secretMatches: false }),
    );
    const res = await handler(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("passes the provided header value to verifySecret", async () => {
    const deps = makeDeps();
    const handler = createPostCleanupHandler(deps);
    await handler(makeRequest("my-secret"));
    expect(deps.verifySecret).toHaveBeenCalledWith("my-secret");
  });

  it("returns 200 with deleted_count and failed_count on success", async () => {
    const handler = createPostCleanupHandler(
      makeDeps({ sweepResult: { deleted: 5, failed: 1 } }),
    );
    const res = await handler(makeRequest("correct"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      deleted_count: 5,
      failed_count: 1,
      status: "ok",
    });
  });

  it("does not call sweepExpiredImages when secret is invalid", async () => {
    const deps = makeDeps({ secretMatches: false });
    const handler = createPostCleanupHandler(deps);
    await handler(makeRequest("wrong"));
    expect(deps.sweepExpiredImages).not.toHaveBeenCalled();
  });

  it("returns 500 when sweepExpiredImages throws", async () => {
    const handler = createPostCleanupHandler(
      makeDeps({ sweepThrows: new Error("db connection failed") }),
    );
    const res = await handler(makeRequest("correct"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "sweep_failed" });
  });
});
