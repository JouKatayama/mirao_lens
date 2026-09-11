import { describe, expect, it, vi } from "vitest";

import {
  EmbeddingGeneratorError,
  OpenAIEmbeddingGenerator,
  toEmbeddingVectors,
  toVectorLiteral,
} from "./embedding";

function generatorFor(request: () => Promise<unknown>) {
  return new OpenAIEmbeddingGenerator({ model: "embedding-model", request });
}

describe("OpenAIEmbeddingGenerator", () => {
  it("throws a configuration error without a model", () => {
    expect(
      () => new OpenAIEmbeddingGenerator({ model: " ", request: vi.fn() }),
    ).toThrow(EmbeddingGeneratorError);
  });

  it("throws a configuration error without a key or an injected request", () => {
    expect(() => new OpenAIEmbeddingGenerator({ model: "m" })).toThrow(
      EmbeddingGeneratorError,
    );
  });

  it("returns one vector per text, in order", async () => {
    const generator = generatorFor(async () => ({
      data: [{ embedding: [1, 0] }, { embedding: [0, 1] }],
    }));

    await expect(generator.embed(["a", "b"])).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("does not call the provider for an empty list", async () => {
    const request = vi.fn();
    const generator = new OpenAIEmbeddingGenerator({
      model: "embedding-model",
      request,
    });

    await expect(generator.embed([])).resolves.toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a response with fewer vectors than texts", async () => {
    const generator = generatorFor(async () => ({
      data: [{ embedding: [1, 0] }],
    }));

    await expect(generator.embed(["a", "b"])).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("rejects a malformed vector rather than storing it", async () => {
    for (const data of [
      [{ embedding: [] }],
      [{ embedding: ["1", "0"] }],
      [{ embedding: [1, Number.NaN] }],
      [{}],
      "not a list",
    ]) {
      const generator = generatorFor(async () => ({ data }));
      await expect(generator.embed(["a"])).rejects.toMatchObject({
        code: "invalid_output",
      });
    }
  });

  it("classifies a provider failure", async () => {
    const generator = generatorFor(async () => {
      throw Object.assign(new Error("rate"), { status: 429 });
    });

    await expect(generator.embed(["a"])).rejects.toMatchObject({
      code: "rate_limited",
    });
  });
});

describe("toEmbeddingVectors", () => {
  it("rejects a response that is not an object with data", () => {
    expect(toEmbeddingVectors(null)).toBeNull();
    expect(toEmbeddingVectors("x")).toBeNull();
    expect(toEmbeddingVectors({})).toBeNull();
  });
});

describe("toVectorLiteral", () => {
  it("writes the form pgvector parses", () => {
    expect(toVectorLiteral([0.5, -1, 0])).toBe("[0.5,-1,0]");
  });
});
