import type {
  BusinessCardRecord,
  ScanStatusResponse,
} from "@miraio/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGetCardIntelligenceStatusHandler,
  createPatchBusinessCardHandler,
  type CardIntelligenceHandlerDependencies,
} from "./card-intelligence-handlers";

const scanId = "00000000-0000-4000-8000-000000000504";
const zeroConfidence = {
  address: 0,
  company: 0,
  department: 0,
  email: 0,
  name: 0,
  phone: 0,
  title: 0,
  website: 0,
};
const extraction = {
  address: null,
  company: "Example Invalid Labs",
  department: null,
  email: null,
  field_confidence: {
    ...zeroConfidence,
    company: 0.98,
    name: 0.99,
    title: 0.97,
  },
  language: "en",
  name: "Mira Testperson",
  phone: null,
  title: "Product Lead",
  website: null,
};
const record: BusinessCardRecord = {
  ...extraction,
  created_at: "2026-08-17T00:00:00.000Z",
  extraction_json: extraction,
  id: "00000000-0000-4000-8000-000000000505",
  scan_id: scanId,
  updated_at: "2026-08-17T00:00:00.000Z",
  user_corrected: false,
};
const ready: ScanStatusResponse = {
  card: {
    ...extraction,
    claims: [
      {
        claim_type: "fact",
        confidence: 0.99,
        field: "name",
        source_type: "business_card",
        value: "Mira Testperson",
      },
      {
        claim_type: "fact",
        confidence: 0.98,
        field: "company",
        source_type: "business_card",
        value: "Example Invalid Labs",
      },
      {
        claim_type: "fact",
        confidence: 0.97,
        field: "title",
        source_type: "business_card",
        value: "Product Lead",
      },
    ],
    user_corrected: false,
  },
  error_code: null,
  flash_brief: null,
  mutual_value: null,
  scan_id: scanId,
  status: "card_ready",
};

function request(
  method = "GET",
  body?: unknown,
  authenticated = true,
): Request {
  return new Request(`http://localhost/v1/scans/${scanId}/status`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(authenticated ? { Authorization: "Bearer valid-token" } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
  });
}

describe("Card Intelligence HTTP handlers", () => {
  const repository = { correctCard: vi.fn(), getStatus: vi.fn() };
  let dependencies: CardIntelligenceHandlerDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4000-8000-000000000005",
      }),
    };
  });

  it("rejects missing authentication before reading a scan", async () => {
    const response = await createGetCardIntelligenceStatusHandler(dependencies)(
      request("GET", undefined, false),
      { params: Promise.resolve({ scanId }) },
    );

    expect(response.status).toBe(401);
    expect(repository.getStatus).not.toHaveBeenCalled();
  });

  it("returns an owner-ready card with explicit FACT claims", async () => {
    repository.getStatus.mockResolvedValue(ready);
    const response = await createGetCardIntelligenceStatusHandler(dependencies)(
      request(),
      { params: Promise.resolve({ scanId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(ready);
  });

  it("returns the same 404 for invalid, missing, or non-owned scans", async () => {
    repository.getStatus.mockResolvedValue(null);
    const handler = createGetCardIntelligenceStatusHandler(dependencies);

    expect(
      (
        await handler(request(), {
          params: Promise.resolve({ scanId: "not-a-uuid" }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await handler(request(), { params: Promise.resolve({ scanId }) }))
        .status,
    ).toBe(404);
  });

  it("applies only validated user card corrections", async () => {
    repository.correctCard.mockResolvedValue({
      ...record,
      field_confidence: { ...record.field_confidence, title: 1 },
      title: "Principal Product Lead",
      user_corrected: true,
    });
    repository.getStatus.mockResolvedValue({
      ...ready,
      card: {
        ...ready.card,
        claims: ready.card.claims.map((claim) =>
          claim.field === "title"
            ? {
                ...claim,
                confidence: 1,
                source_type: "user_correction",
                value: "Principal Product Lead",
              }
            : claim,
        ),
        field_confidence: { ...ready.card.field_confidence, title: 1 },
        title: "Principal Product Lead",
        user_corrected: true,
      },
    });
    const response = await createPatchBusinessCardHandler(dependencies)(
      request("PATCH", { title: "Principal Product Lead" }),
      { params: Promise.resolve({ scanId }) },
    );

    expect(response.status).toBe(200);
    expect(repository.correctCard).toHaveBeenCalledWith(scanId, {
      title: "Principal Product Lead",
    });
    await expect(response.json()).resolves.toMatchObject({
      card: { title: "Principal Product Lead", user_corrected: true },
      status: "card_ready",
    });
  });

  it("rejects empty, unknown, and confidence corrections", async () => {
    const handler = createPatchBusinessCardHandler(dependencies);

    for (const body of [{}, { identity: "invented" }, { confidence: 1 }]) {
      const response = await handler(request("PATCH", body), {
        params: Promise.resolve({ scanId }),
      });
      expect(response.status).toBe(400);
    }
    expect(repository.correctCard).not.toHaveBeenCalled();
  });

  it("does not disclose a missing or cross-user card during correction", async () => {
    repository.correctCard.mockResolvedValue(null);
    const response = await createPatchBusinessCardHandler(dependencies)(
      request("PATCH", { title: null }),
      { params: Promise.resolve({ scanId }) },
    );

    expect(response.status).toBe(404);
  });
});
