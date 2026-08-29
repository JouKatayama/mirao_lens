import { describe, expect, it } from "vitest";

import {
  contentTypeForScanImagePath,
  createRawScanImageExpiration,
  extensionForScanImage,
  maximumScanImageBytes,
  meetingGoals,
  scanCaptureMetadataSchema,
  scanCreateResponseSchema,
  scanImageContentTypes,
  scanImagePayloadSchema,
  scanRecordSchema,
} from "./card-scan";

const scanId = "00000000-0000-4000-8000-000000000404";

describe("card scan contracts", () => {
  it("accepts every canonical meeting goal", () => {
    for (const meetingGoal of meetingGoals) {
      expect(
        scanCaptureMetadataSchema.parse({
          scan_id: scanId,
          meeting_goal: meetingGoal,
          content_type: "image/jpeg",
        }).meeting_goal,
      ).toBe(meetingGoal);
    }
  });

  it("rejects unknown meeting goals and invalid scan IDs", () => {
    expect(() =>
      scanCaptureMetadataSchema.parse({
        scan_id: "not-a-uuid",
        meeting_goal: "coffee",
        content_type: "image/jpeg",
      }),
    ).toThrow();
  });

  it("accepts only private-bucket image content types", () => {
    for (const contentType of scanImageContentTypes) {
      expect(
        scanCaptureMetadataSchema.parse({
          scan_id: scanId,
          meeting_goal: "networking",
          content_type: contentType,
        }).content_type,
      ).toBe(contentType);
    }

    expect(() =>
      scanCaptureMetadataSchema.parse({
        scan_id: scanId,
        meeting_goal: "networking",
        content_type: "image/svg+xml",
      }),
    ).toThrow();
  });

  it("derives fixed safe file extensions", () => {
    expect(extensionForScanImage("image/jpeg")).toBe("jpg");
    expect(extensionForScanImage("image/heif")).toBe("heif");
    expect(contentTypeForScanImagePath("owner/scan/front.jpg")).toBe(
      "image/jpeg",
    );
    expect(contentTypeForScanImagePath("owner/scan/front.exe")).toBeNull();
  });

  it("rejects empty and oversized images", () => {
    const metadata = {
      scan_id: scanId,
      meeting_goal: "networking",
      content_type: "image/jpeg",
    } as const;

    expect(() =>
      scanImagePayloadSchema.parse({ ...metadata, image_byte_length: 0 }),
    ).toThrow();
    expect(() =>
      scanImagePayloadSchema.parse({
        ...metadata,
        image_byte_length: maximumScanImageBytes + 1,
      }),
    ).toThrow();
  });

  it("keeps the public response state narrower than database states", () => {
    expect(
      scanCreateResponseSchema.parse({ scan_id: scanId, status: "extracting" }),
    ).toEqual({ scan_id: scanId, status: "extracting" });
    expect(() =>
      scanCreateResponseSchema.parse({
        scan_id: scanId,
        status: "extracting_card",
      }),
    ).toThrow();
  });

  it("sets raw-image expiry one hour after reservation", () => {
    expect(
      createRawScanImageExpiration(new Date("2026-08-17T00:00:00.000Z")),
    ).toBe("2026-08-17T01:00:00.000Z");
  });

  it("accepts PostgreSQL timestamptz offsets in persisted scan records", () => {
    expect(
      scanRecordSchema.parse({
        id: scanId,
        meeting_goal: "networking",
        raw_image_expires_at: "2026-08-17T01:00:00+00:00",
        raw_image_path: `owner/${scanId}/front.jpg`,
        status: "created",
      }).status,
    ).toBe("created");
  });
});
