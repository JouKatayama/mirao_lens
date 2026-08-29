import { maximumScanImageBytes, type ScanRecord } from "@miraio/domain";
import { ScanRepositoryError } from "@miraio/db";
import { describe, expect, it, vi } from "vitest";

import {
  createPostScanHandler,
  type ScanHandlerDependencies,
} from "./scan-handlers";

const scanId = "00000000-0000-4000-8000-000000000404";
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
