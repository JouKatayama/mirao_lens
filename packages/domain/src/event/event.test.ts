import { describe, expect, it } from "vitest";

import {
  eventCreateRequestSchema,
  eventRecordSchema,
  eventScanAttachRequestSchema,
} from "./event";

describe("event contracts", () => {
  it("accepts a short, named event and trims surrounding spaces", () => {
    expect(eventCreateRequestSchema.parse({ name: "  展示会  " })).toEqual({
      name: "展示会",
    });
  });

  it("rejects empty and oversized names", () => {
    expect(eventCreateRequestSchema.safeParse({ name: "  " }).success).toBe(
      false,
    );
    expect(
      eventCreateRequestSchema.safeParse({ name: "a".repeat(121) }).success,
    ).toBe(false);
  });

  it("keeps event and scan identities as UUIDs", () => {
    const scanId = "11111111-1111-4111-8111-111111111111";
    expect(eventScanAttachRequestSchema.parse({ scan_id: scanId })).toEqual({
      scan_id: scanId,
    });
    expect(
      eventRecordSchema.safeParse({
        created_at: "2026-11-03T00:00:00Z",
        id: "not-a-uuid",
        name: "交流会",
      }).success,
    ).toBe(false);
  });
});
