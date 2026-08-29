import { describe, expect, it, vi } from "vitest";

import { ScanApiClient, ScanApiError } from "./scan-api";

const scanId = "00000000-0000-4000-8000-000000000404";

describe("ScanApiClient", () => {
  it("sends binary image data with stable scan metadata headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { scan_id: scanId, status: "extracting" },
          { status: 201 },
        ),
      );
    const client = new ScanApiClient("https://api.example.invalid", fetchMock);
    const bytes = new Uint8Array([255, 216, 255]).buffer;

    await expect(
      client.createScan("access-token", {
        bytes,
        contentType: "image/jpeg",
        meetingGoal: "networking",
        scanId,
      }),
    ).resolves.toEqual({ scan_id: scanId, status: "extracting" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/v1/scans",
      expect.objectContaining({
        body: bytes,
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "image/jpeg",
          "X-Meeting-Goal": "networking",
          "X-Scan-Id": scanId,
        },
        method: "POST",
      }),
    );
  });

  it("returns a typed sanitized upload failure with retry scan ID", async () => {
    const client = new ScanApiClient(
      "https://api.example.invalid",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "scan_upload_unavailable",
              message: "Please retry.",
              scan_id: scanId,
            },
          },
          { status: 503 },
        ),
      ),
    );
    const error = await client
      .createScan("access-token", {
        bytes: new ArrayBuffer(1),
        contentType: "image/jpeg",
        meetingGoal: "sales",
        scanId,
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ScanApiError);
    expect(error).toMatchObject({
      code: "scan_upload_unavailable",
      scanId,
      status: 503,
    });
  });

  it("fails closed when the server response violates the domain contract", async () => {
    const client = new ScanApiClient(
      "https://api.example.invalid",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ scan_id: scanId, status: "image_uploaded" }),
        ),
    );

    await expect(
      client.createScan("access-token", {
        bytes: new ArrayBuffer(1),
        contentType: "image/jpeg",
        meetingGoal: "networking",
        scanId,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("reads an authenticated Card Intelligence status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        card: null,
        error_code: null,
        flash_brief: null,
        mutual_value: null,
        scan_id: scanId,
        status: "extracting",
      }),
    );
    const client = new ScanApiClient("https://api.example.invalid", fetchMock);

    await expect(
      client.getStatus("access-token", scanId),
    ).resolves.toMatchObject({ status: "extracting" });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.invalid/v1/scans/${scanId}/status`,
      { headers: { Authorization: "Bearer access-token" } },
    );
  });

  it("sends only user card corrections and validates the ready response", async () => {
    const ready = {
      card: {
        address: null,
        claims: [
          {
            claim_type: "fact",
            confidence: 1,
            field: "title",
            source_type: "user_correction",
            value: "Principal Product Lead",
          },
        ],
        company: null,
        department: null,
        email: null,
        field_confidence: {
          address: 0,
          company: 0,
          department: 0,
          email: 0,
          name: 0,
          phone: 0,
          title: 1,
          website: 0,
        },
        language: "en",
        name: null,
        phone: null,
        title: "Principal Product Lead",
        user_corrected: true,
        website: null,
      },
      error_code: null,
      flash_brief: null,
      mutual_value: null,
      scan_id: scanId,
      status: "card_ready",
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(ready));
    const client = new ScanApiClient("https://api.example.invalid", fetchMock);

    await expect(
      client.correctCard("access-token", scanId, {
        title: "Principal Product Lead",
      }),
    ).resolves.toEqual(ready);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.invalid/v1/scans/${scanId}/card`,
      expect.objectContaining({
        body: JSON.stringify({ title: "Principal Product Lead" }),
        method: "PATCH",
      }),
    );
  });
});
