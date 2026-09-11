import { classifyProviderFailure } from "./provider-error";
import {
  createOpenAIClient,
  providerTimeoutMilliseconds,
} from "./provider-client";

export type EmbeddingGeneratorErrorCode =
  | "configuration"
  | "invalid_output"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

export class EmbeddingGeneratorError extends Error {
  constructor(readonly code: EmbeddingGeneratorErrorCode) {
    super(`Embedding generation failed: ${code}.`);
    this.name = "EmbeddingGeneratorError";
  }
}

export interface EmbeddingGenerator {
  embed(texts: readonly string[]): Promise<number[][]>;
}

type EmbeddingRequest = (request: {
  model: string;
  texts: readonly string[];
}) => Promise<unknown>;

export type OpenAIEmbeddingGeneratorOptions = Readonly<{
  apiKey?: string;
  baseUrl?: string;
  model: string;
  request?: EmbeddingRequest;
}>;

/**
 * Turns the text of Personal Context items, and the description of the person
 * being met, into vectors in one shared space so the two can be compared.
 *
 * Both sides must come from the same model: a vector from one model has no
 * meaning against a vector from another, and mixing them would silently return
 * the wrong items rather than fail. Changing AI_EMBEDDING_MODEL therefore
 * requires the stored embeddings to be regenerated.
 */
export class OpenAIEmbeddingGenerator implements EmbeddingGenerator {
  private readonly model: string;
  private readonly request: EmbeddingRequest;

  constructor(options: OpenAIEmbeddingGeneratorOptions) {
    this.model = options.model.trim();

    if (!this.model) {
      throw new EmbeddingGeneratorError("configuration");
    }

    if (options.request) {
      this.request = options.request;
      return;
    }

    const apiKey = options.apiKey?.trim();

    if (!apiKey) {
      throw new EmbeddingGeneratorError("configuration");
    }

    const client = createOpenAIClient(
      apiKey,
      providerTimeoutMilliseconds.embedding,
      options.baseUrl?.trim() || undefined,
    );

    this.request = async ({ model, texts }) =>
      client.embeddings.create({ input: [...texts], model });
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    let output: unknown;

    try {
      output = await this.request({ model: this.model, texts });
    } catch (error) {
      throw new EmbeddingGeneratorError(classifyProviderFailure(error));
    }

    const vectors = toEmbeddingVectors(output);

    // A short response would silently pair an item with another item's vector,
    // which is worse than no retrieval at all.
    if (vectors === null || vectors.length !== texts.length) {
      throw new EmbeddingGeneratorError("invalid_output");
    }

    return vectors;
  }
}

export function toEmbeddingVectors(output: unknown): number[][] | null {
  if (typeof output !== "object" || output === null) {
    return null;
  }

  const data = (output as { data?: unknown }).data;

  if (!Array.isArray(data)) {
    return null;
  }

  const vectors: number[][] = [];

  for (const row of data) {
    const embedding = (row as { embedding?: unknown })?.embedding;

    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      !embedding.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      return null;
    }

    vectors.push(embedding as number[]);
  }

  return vectors;
}

/** pgvector accepts its own text form, which is what PostgREST can carry. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}
