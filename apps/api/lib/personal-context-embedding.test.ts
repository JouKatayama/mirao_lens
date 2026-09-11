import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  embeddingBackfillLimit,
  processPersonalContextEmbedding,
  type PersonalContextEmbeddingDependencies,
} from "./personal-context-embedding";

const accessToken = "valid-token";

describe("processPersonalContextEmbedding", () => {
  const repository = {
    listItemsMissingEmbedding: vi.fn(),
    setItemEmbedding: vi.fn(),
  };
  const embed = vi.fn();
  let dependencies: PersonalContextEmbeddingDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    repository.setItemEmbedding.mockResolvedValue(true);
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({ repository, userId: "u1" }),
      createGenerator: () => ({ embed }),
    };
  });

  it("stores one vector per item, in the pgvector text form", async () => {
    repository.listItemsMissingEmbedding.mockResolvedValue([
      { id: "item-1", text: "製造業のデータ基盤" },
      { id: "item-2", text: "生成AIの社内展開" },
    ]);
    embed.mockResolvedValue([
      [1, 0],
      [0, 1],
    ]);

    await expect(
      processPersonalContextEmbedding({ accessToken }, dependencies),
    ).resolves.toEqual({ embedded: 2, status: "completed" });

    expect(repository.listItemsMissingEmbedding).toHaveBeenCalledWith(
      embeddingBackfillLimit,
    );
    expect(repository.setItemEmbedding).toHaveBeenNthCalledWith(
      1,
      "item-1",
      "[1,0]",
    );
    expect(repository.setItemEmbedding).toHaveBeenNthCalledWith(
      2,
      "item-2",
      "[0,1]",
    );
  });

  it("does nothing when retrieval is not configured", async () => {
    await expect(
      processPersonalContextEmbedding(
        { accessToken },
        { ...dependencies, createGenerator: () => null },
      ),
    ).resolves.toEqual({ embedded: 0, status: "skipped" });

    expect(repository.listItemsMissingEmbedding).not.toHaveBeenCalled();
  });

  it("does not call the provider when nothing is missing a vector", async () => {
    repository.listItemsMissingEmbedding.mockResolvedValue([]);

    await expect(
      processPersonalContextEmbedding({ accessToken }, dependencies),
    ).resolves.toEqual({ embedded: 0, status: "skipped" });
    expect(embed).not.toHaveBeenCalled();
  });

  it("skips without a session rather than failing the pipeline", async () => {
    vi.mocked(dependencies.authenticate).mockResolvedValue(null);

    await expect(
      processPersonalContextEmbedding({ accessToken }, dependencies),
    ).resolves.toEqual({ embedded: 0, status: "skipped" });
  });

  it("reports a provider failure without throwing into the pipeline", async () => {
    repository.listItemsMissingEmbedding.mockResolvedValue([
      { id: "item-1", text: "a" },
    ]);
    embed.mockRejectedValue(new Error("provider down"));

    await expect(
      processPersonalContextEmbedding({ accessToken }, dependencies),
    ).resolves.toEqual({ embedded: 0, status: "failed" });
  });

  it("counts only the rows that were actually written", async () => {
    repository.listItemsMissingEmbedding.mockResolvedValue([
      { id: "item-1", text: "a" },
      { id: "item-2", text: "b" },
    ]);
    embed.mockResolvedValue([
      [1, 0],
      [0, 1],
    ]);
    repository.setItemEmbedding.mockResolvedValueOnce(true);
    repository.setItemEmbedding.mockResolvedValueOnce(false);

    await expect(
      processPersonalContextEmbedding({ accessToken }, dependencies),
    ).resolves.toEqual({ embedded: 1, status: "completed" });
  });
});
