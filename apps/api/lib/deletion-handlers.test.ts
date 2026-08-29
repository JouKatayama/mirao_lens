import { describe, expect, it, vi } from "vitest";

import {
  createDeleteAccountHandler,
  type AccountHandlerDependencies,
} from "./account-handlers";
import {
  createDeleteScanHandler,
  type DeleteScanHandlerDependencies,
} from "./scan-handlers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const scanId = "00000000-0000-4016-8000-000000000001";
const userId = "00000000-0000-4016-8000-000000000099";

function makeRequest(
  url = `http://localhost/v1/scans/${scanId}`,
  init?: RequestInit,
  authenticated = true,
): Request {
  return new Request(url, {
    method: "DELETE",
    headers: {
      ...(authenticated ? { Authorization: "Bearer test-token" } : {}),
    },
    ...init,
  });
}

function makeContext(id = scanId) {
  return { params: Promise.resolve({ scanId: id }) };
}

function makeScanDeps(
  overrides: Partial<{
    session: Awaited<ReturnType<DeleteScanHandlerDependencies["authenticate"]>>;
    authThrows: Error;
    deleteScanReturn: boolean;
    deleteScanThrows: Error;
  }> = {},
): DeleteScanHandlerDependencies {
  const repository = {
    deleteScan: overrides.deleteScanThrows
      ? vi.fn().mockRejectedValue(overrides.deleteScanThrows)
      : vi.fn().mockResolvedValue(overrides.deleteScanReturn ?? true),
  };

  return {
    authenticate: overrides.authThrows
      ? vi.fn().mockRejectedValue(overrides.authThrows)
      : vi.fn().mockResolvedValue(
          overrides.session !== undefined
            ? overrides.session
            : { repository, userId },
        ),
  };
}

function makeAccountDeps(
  overrides: Partial<{
    session: Awaited<ReturnType<AccountHandlerDependencies["authenticate"]>>;
    authThrows: Error;
    deleteAccountThrows: Error;
  }> = {},
): AccountHandlerDependencies {
  const repository = {
    deleteAccount: overrides.deleteAccountThrows
      ? vi.fn().mockRejectedValue(overrides.deleteAccountThrows)
      : vi.fn().mockResolvedValue(undefined),
  };

  return {
    authenticate: overrides.authThrows
      ? vi.fn().mockRejectedValue(overrides.authThrows)
      : vi.fn().mockResolvedValue(
          overrides.session !== undefined
            ? overrides.session
            : { repository, userId },
        ),
  };
}

// ─── DELETE /v1/scans/:scanId ────────────────────────────────────────────────

describe("createDeleteScanHandler", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const handler = createDeleteScanHandler(makeScanDeps());
    const res = await handler(makeRequest(undefined, undefined, false), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 401 when session is null", async () => {
    const handler = createDeleteScanHandler(
      makeScanDeps({ session: null }),
    );
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 500 when authenticate throws a generic error", async () => {
    const handler = createDeleteScanHandler(
      makeScanDeps({ authThrows: new Error("db down") }),
    );
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });

  it("returns 404 when scanId is not a valid UUID", async () => {
    const handler = createDeleteScanHandler(makeScanDeps());
    const res = await handler(makeRequest(), makeContext("not-a-uuid"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleteScan returns false (scan not found)", async () => {
    const handler = createDeleteScanHandler(
      makeScanDeps({ deleteScanReturn: false }),
    );
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it("returns 204 when scan is deleted successfully", async () => {
    const handler = createDeleteScanHandler(makeScanDeps());
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it("calls deleteScan with the correct scanId and userId", async () => {
    const deps = makeScanDeps();
    const handler = createDeleteScanHandler(deps);
    await handler(makeRequest(), makeContext());
    const session = await deps.authenticate("test-token");
    expect(session?.repository.deleteScan).toHaveBeenCalledWith(scanId, userId);
  });

  it("returns 500 when deleteScan throws", async () => {
    const handler = createDeleteScanHandler(
      makeScanDeps({ deleteScanThrows: new Error("db error") }),
    );
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

// ─── DELETE /v1/account ──────────────────────────────────────────────────────

describe("createDeleteAccountHandler", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const handler = createDeleteAccountHandler(makeAccountDeps());
    const res = await handler(
      new Request("http://localhost/v1/account", { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when session is null", async () => {
    const handler = createDeleteAccountHandler(
      makeAccountDeps({ session: null }),
    );
    const res = await handler(
      new Request("http://localhost/v1/account", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 500 when authenticate throws a generic error", async () => {
    const handler = createDeleteAccountHandler(
      makeAccountDeps({ authThrows: new Error("timeout") }),
    );
    const res = await handler(
      new Request("http://localhost/v1/account", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    expect(res.status).toBe(500);
  });

  it("returns 204 when account is deleted successfully", async () => {
    const handler = createDeleteAccountHandler(makeAccountDeps());
    const res = await handler(
      new Request("http://localhost/v1/account", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it("calls deleteAccount with the userId from the session", async () => {
    const deps = makeAccountDeps();
    const handler = createDeleteAccountHandler(deps);
    await handler(
      new Request("http://localhost/v1/account", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    const session = await deps.authenticate("test-token");
    expect(session?.repository.deleteAccount).toHaveBeenCalledWith(userId);
  });

  it("returns 500 when deleteAccount throws", async () => {
    const handler = createDeleteAccountHandler(
      makeAccountDeps({ deleteAccountThrows: new Error("rpc failed") }),
    );
    const res = await handler(
      new Request("http://localhost/v1/account", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    expect(res.status).toBe(500);
  });
});
