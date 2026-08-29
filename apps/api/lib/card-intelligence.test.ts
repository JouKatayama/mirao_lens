import { CardExtractionError } from "@miraio/ai";
import { CardIntelligenceRepositoryError } from "@miraio/db";
import type { CardExtraction } from "@miraio/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  processCardIntelligence,
  type CardIntelligenceProcessorDependencies,
} from "./card-intelligence";

const scanId = "00000000-0000-4000-8000-000000000504";
const rawImagePath = `00000000-0000-4000-8000-000000000005/${scanId}/front.jpg`;
const extraction: CardExtraction = {
  address: null,
  company: "Example Invalid Labs",
  department: null,
  email: null,
  field_confidence: {
    address: 0,
    company: 0.98,
    department: 0,
    email: 0,
    name: 0.99,
    phone: 0,
    title: 0.97,
    website: 0,
  },
  language: "en",
  name: "Mira Testperson",
  phone: null,
  title: "Product Lead",
  website: null,
};

describe("Card Intelligence processor", () => {
  const repository = {
    claimExtraction: vi.fn(),
    completeExtraction: vi.fn(),
    deleteRawImage: vi.fn(),
    downloadRawImage: vi.fn(),
    failExtraction: vi.fn(),
  };
  const extractor = { extract: vi.fn() };
  let now: number;
  let dependencies: CardIntelligenceProcessorDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    now = 100;
    repository.claimExtraction.mockResolvedValue({
      rawImagePath,
      runId: "00000000-0000-4000-8000-000000000515",
    });
    repository.downloadRawImage.mockResolvedValue({
      bytes: new Uint8Array([255, 216, 255]).buffer,
      contentType: "image/jpeg",
    });
    repository.completeExtraction.mockResolvedValue({});
    repository.deleteRawImage.mockResolvedValue(undefined);
    repository.failExtraction.mockResolvedValue(undefined);
    extractor.extract.mockImplementation(async () => {
      now = 184;
      return extraction;
    });
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4000-8000-000000000005",
      }),
      createExtractor: () => extractor,
      modelAlias: "fixture-model",
      nowMilliseconds: () => now,
      provider: "fixture-provider",
    };
  });

  it("claims, extracts, persists, and deletes one private image", async () => {
    await expect(
      processCardIntelligence({ accessToken: "token", scanId }, dependencies),
    ).resolves.toEqual({ rawImageDeleted: true, status: "completed" });
    expect(repository.claimExtraction).toHaveBeenCalledWith(
      scanId,
      "fixture-provider",
      "fixture-model",
    );
    expect(repository.completeExtraction).toHaveBeenCalledWith(
      scanId,
      "00000000-0000-4000-8000-000000000515",
      extraction,
      84,
    );
    expect(repository.deleteRawImage).toHaveBeenCalledWith(
      scanId,
      rawImagePath,
    );
    expect(repository.failExtraction).not.toHaveBeenCalled();
  });

  it("skips duplicate work when no claim is available", async () => {
    repository.claimExtraction.mockResolvedValue(null);

    await expect(
      processCardIntelligence({ accessToken: "token", scanId }, dependencies),
    ).resolves.toMatchObject({ status: "skipped" });
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it("marks provider rate limits retryable with a sanitized code", async () => {
    extractor.extract.mockRejectedValue(
      new CardExtractionError("rate_limited"),
    );

    await expect(
      processCardIntelligence({ accessToken: "token", scanId }, dependencies),
    ).resolves.toMatchObject({ status: "failed_retryable" });
    expect(repository.failExtraction).toHaveBeenCalledWith(
      scanId,
      "00000000-0000-4000-8000-000000000515",
      "rate_limited",
      false,
    );
  });

  it("marks missing configuration terminal after creating a run", async () => {
    dependencies = {
      ...dependencies,
      createExtractor: () => {
        throw new CardExtractionError("configuration");
      },
    };

    await expect(
      processCardIntelligence({ accessToken: "token", scanId }, dependencies),
    ).resolves.toMatchObject({ status: "failed_terminal" });
    expect(repository.failExtraction).toHaveBeenCalledWith(
      scanId,
      expect.any(String),
      "configuration",
      true,
    );
  });

  it("marks a missing raw image terminal without exposing storage text", async () => {
    repository.downloadRawImage.mockRejectedValue(
      new CardIntelligenceRepositoryError("download", "not_found"),
    );

    await expect(
      processCardIntelligence({ accessToken: "token", scanId }, dependencies),
    ).resolves.toMatchObject({ status: "failed_terminal" });
    expect(repository.failExtraction).toHaveBeenCalledWith(
      scanId,
      expect.any(String),
      "raw_image_missing",
      true,
    );
  });

  it("keeps a completed card usable when only raw-image deletion fails", async () => {
    repository.deleteRawImage.mockRejectedValue(
      new CardIntelligenceRepositoryError("delete", "storage_error"),
    );

    await expect(
      processCardIntelligence({ accessToken: "token", scanId }, dependencies),
    ).resolves.toEqual({ rawImageDeleted: false, status: "completed" });
    expect(repository.failExtraction).not.toHaveBeenCalled();
  });
});
