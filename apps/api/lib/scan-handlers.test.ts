import { maximumScanImageBytes, type ScanRecord } from "@miraio/domain";
import { ScanRepositoryError } from "@miraio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGetScansHandler,
  createPatchScanFavoriteHandler,
  createPostScanHandler,
  OPTIONS,
  type GetScansHandlerDependencies,
  type ScanFavoriteHandlerDependencies,
  type ScanHandlerDependencies,
} from "./scan-handlers";

const scanId = "00000000-0000-4000-8000-000000000404";
const favoriteScanId = "00000000-0000-4000-8000-000000000405";
const userId = "00000000-0000-4000-8000-000000000044";
const image = new Uint8Array([255, 216, 255]).buffer;

function scanRecord(status: ScanRecord["status"]): ScanRecord {
  return {
    id: scanId,
    meeting_goal: "networking",
    raw_image_expires_at: "2026-08-17T01:00:00.000Z",
    raw_image_path: `${userId}/${scanId}/front.jpg`,
    status,
  };
}

function request(
  overrides?: Readonly<{
    body?: ArrayBuffer;
    headers?: Record<string, string>;
  }>,
): Request {
  return new Request("http://localhost/v1/scans", {
    body: overrides?.body ?? image,
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "image/jpeg",
      "X-Meeting-Goal": "networking",
      "X-Scan-Id": scanId,
      ...overrides?.headers,
    },
    method: "POST",
  });
}

function dependencies(
  options?: Readonly<{
    needsUpload?: boolean;
    reserveError?: unknown;
    uploadError?: unknown;
  }>,
) {
  const repository = {
    completeUpload: vi.fn().mockResolvedValue(scanRecord("extracting_card")),
    markUploadFailed: vi.fn().mockResolvedValue(undefined),
    reserve: options?.reserveError
      ? vi.fn().mockRejectedValue(options.reserveError)
      : vi.fn().mockResolvedValue({
          needsUpload: options?.needsUpload ?? true,
          record: scanRecord(
            options?.needsUpload === false ? "extracting_card" : "created",
          ),
          replayed: options?.needsUpload === false,
        }),
    uploadRawImage: options?.uploadError
      ? vi.fn().mockRejectedValue(options.uploadError)
      : vi.fn().mockResolvedValue(undefined),
  };
  const value: ScanHandlerDependencies = {
    authenticate: vi.fn().mockResolvedValue({ repository, userId }),
    now: () => new Date("2026-08-17T00:00:00.000Z"),
    scheduleExtraction: vi.fn(),
  };

  return { dependencies: value, repository };
}

describe("POST /v1/scans", () => {
  it("rejects unauthenticated requests without reserving a scan", async () => {
    const { dependencies: value } = dependencies();
    const authenticate = vi.mocked(value.authenticate);
    const response = await createPostScanHandler(value)(
      new Request("http://localhost/v1/scans", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("rejects invalid capture metadata before persistence", async () => {
    const { dependencies: value, repository } = dependencies();
    const response = await createPostScanHandler(value)(
      request({ headers: { "X-Meeting-Goal": "coffee" } }),
    );

    expect(response.status).toBe(400);
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before reading or persistence", async () => {
    const { dependencies: value, repository } = dependencies();
    const response = await createPostScanHandler(value)(
      request({
        headers: { "Content-Length": String(maximumScanImageBytes + 1) },
      }),
    );

    expect(response.status).toBe(413);
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it("reserves, privately uploads, and completes a new scan", async () => {
    const { dependencies: value, repository } = dependencies();
    const response = await createPostScanHandler(value)(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      scan_id: scanId,
      status: "extracting",
    });
    expect(repository.reserve).toHaveBeenCalledWith({
      expiresAt: "2026-08-17T01:00:00.000Z",
      meetingGoal: "networking",
      rawImagePath: `${userId}/${scanId}/front.jpg`,
      scanId,
    });
    expect(repository.uploadRawImage).toHaveBeenCalledWith(
      `${userId}/${scanId}/front.jpg`,
      expect.any(ArrayBuffer),
      "image/jpeg",
    );
    expect(repository.completeUpload).toHaveBeenCalledWith(scanId);
    expect(value.scheduleExtraction).toHaveBeenCalledWith({
      accessToken: "valid-token",
      scanId,
    });
  });

  it("returns an accepted replay without a duplicate upload", async () => {
    const { dependencies: value, repository } = dependencies({
      needsUpload: false,
    });
    const response = await createPostScanHandler(value)(request());

    expect(response.status).toBe(200);
    expect(repository.uploadRawImage).not.toHaveBeenCalled();
    expect(repository.completeUpload).not.toHaveBeenCalled();
    expect(value.scheduleExtraction).toHaveBeenCalledWith({
      accessToken: "valid-token",
      scanId,
    });
  });

  it("marks a storage failure retryable without leaking provider text", async () => {
    const { dependencies: value, repository } = dependencies({
      uploadError: new ScanRepositoryError("upload_raw_image", "storage_error"),
    });
    const response = await createPostScanHandler(value)(request());
    const body = (await response.json()) as {
      error: { code: string; message: string; scan_id: string };
    };

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({
      code: "scan_upload_unavailable",
      scan_id: scanId,
    });
    expect(body.error.message).not.toContain("upload_raw_image");
    expect(repository.markUploadFailed).toHaveBeenCalledWith(scanId);
  });

  it("returns a non-disclosing conflict for incompatible replay metadata", async () => {
    const { dependencies: value, repository } = dependencies({
      reserveError: new ScanRepositoryError("reserve_scan", "conflict"),
    });
    const response = await createPostScanHandler(value)(request());
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("scan_conflict");
    expect(repository.uploadRawImage).not.toHaveBeenCalled();
  });
});

describe("OPTIONS /v1/scans", () => {
  it("advertises every method the module's routes implement", () => {
    const allowed = new Set(
      OPTIONS()
        .headers.get("access-control-allow-methods")
        ?.split(",")
        .map((method) => method.trim().toUpperCase()),
    );

    // DELETE belongs to /v1/scans/:scanId, which re-exports this same handler.
    // Browsers preflight it, so leaving it out blocks the request entirely.
    expect(allowed).toEqual(new Set(["GET", "POST", "DELETE", "OPTIONS"]));
  });
});

describe("createPatchScanFavoriteHandler", () => {
  const repository = { setScanFavorite: vi.fn() };
  let dependencies: ScanFavoriteHandlerDependencies;

  function patch(body: unknown, authenticated = true, id = favoriteScanId) {
    return createPatchScanFavoriteHandler(dependencies)(
      new Request(`http://api/v1/scans/${id}/favorite`, {
        body: JSON.stringify(body),
        headers: {
          ...(authenticated ? { Authorization: "Bearer valid-token" } : {}),
          "Content-Type": "application/json",
        },
        method: "PATCH",
      }),
      { params: Promise.resolve({ scanId: id }) },
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({ repository }),
    };
  });

  it("marks a scan and echoes the stored value", async () => {
    repository.setScanFavorite.mockResolvedValue(true);

    const res = await patch({ is_favorite: true });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      is_favorite: true,
      scan_id: favoriteScanId,
    });
    expect(repository.setScanFavorite).toHaveBeenCalledWith(
      favoriteScanId,
      true,
    );
  });

  it("unmarks a scan", async () => {
    repository.setScanFavorite.mockResolvedValue(false);

    const res = await patch({ is_favorite: false });

    expect((await res.json()).is_favorite).toBe(false);
  });

  it("returns 404 when the scan is unknown or another user's", async () => {
    repository.setScanFavorite.mockResolvedValue(null);

    expect((await patch({ is_favorite: true })).status).toBe(404);
  });

  it("returns 404 for a scan id that is not a UUID", async () => {
    const res = await patch({ is_favorite: true }, true, "nope");

    expect(res.status).toBe(404);
    expect(repository.setScanFavorite).not.toHaveBeenCalled();
  });

  it("rejects a body without the flag", async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ is_favorite: "yes" })).status).toBe(400);
    expect(repository.setScanFavorite).not.toHaveBeenCalled();
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await patch({ is_favorite: true }, false);

    expect(res.status).toBe(401);
    expect(repository.setScanFavorite).not.toHaveBeenCalled();
  });

  it("returns 500 when the write fails", async () => {
    repository.setScanFavorite.mockRejectedValue(new Error("db"));

    expect((await patch({ is_favorite: true })).status).toBe(500);
  });
});

describe("createGetScansHandler paging", () => {
  const repository = { listScans: vi.fn() };
  let dependencies: GetScansHandlerDependencies;

  function item(createdAt: string) {
    return {
      card_company: null,
      card_name: null,
      card_title: null,
      created_at: createdAt,
      is_favorite: false,
      meeting_goal: "networking" as const,
      scan_id: favoriteScanId,
      status: "deep_ready" as const,
    };
  }

  function get(search = "") {
    return createGetScansHandler(dependencies)(
      new Request(`http://api/v1/scans${search}`, {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({ repository }),
    };
  });

  it("asks for a default page and reports the end of the list", async () => {
    repository.listScans.mockResolvedValue([item("2026-09-10T00:00:00.000Z")]);

    const res = await get();

    expect(repository.listScans).toHaveBeenCalledWith(20, undefined);
    await expect(res.json()).resolves.toMatchObject({ next_cursor: null });
  });

  it("returns a cursor when the page came back full", async () => {
    repository.listScans.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) =>
        item(`2026-09-${String(20 - index).padStart(2, "0")}T00:00:00.000Z`),
      ),
    );

    const res = await get();

    await expect(res.json()).resolves.toMatchObject({
      next_cursor: "2026-09-01T00:00:00.000Z",
    });
  });

  it("passes the cursor and limit through", async () => {
    repository.listScans.mockResolvedValue([]);

    await get("?before=2026-09-01T00:00:00.000Z&limit=5");

    expect(repository.listScans).toHaveBeenCalledWith(
      5,
      "2026-09-01T00:00:00.000Z",
    );
  });

  it("rejects a cursor that is not a timestamp and a limit out of range", async () => {
    expect((await get("?before=yesterday")).status).toBe(400);
    expect((await get("?limit=0")).status).toBe(400);
    expect((await get("?limit=500")).status).toBe(400);
    expect(repository.listScans).not.toHaveBeenCalled();
  });
});
