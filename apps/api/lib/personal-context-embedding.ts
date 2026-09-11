import {
  OpenAIEmbeddingGenerator,
  toVectorLiteral,
  type EmbeddingGenerator,
} from "@miraio/ai";
import { authenticateDatabaseSession } from "@miraio/db";

import {
  readOpenAIEmbeddingConfig,
  readServerSupabaseConfig,
} from "./server-config";

type EmbeddingRepositoryPort = Readonly<{
  listItemsMissingEmbedding(
    limit: number,
  ): Promise<{ id: string; text: string }[]>;
  setItemEmbedding(itemId: string, embedding: string): Promise<boolean>;
}>;

type EmbeddingSession = Readonly<{
  repository: EmbeddingRepositoryPort;
  userId: string;
}>;

export type PersonalContextEmbeddingDependencies = Readonly<{
  authenticate(accessToken: string): Promise<EmbeddingSession | null>;
  createGenerator(): EmbeddingGenerator | null;
}>;

export type PersonalContextEmbeddingResult = Readonly<{
  embedded: number;
  status: "completed" | "skipped" | "failed";
}>;

/**
 * Approved context items are embedded in batches of at most this many. A
 * profile is tens of items, and onboarding approves them together, so one
 * sweep covers a new user; the bound exists so a pathological profile cannot
 * turn one scan into an unbounded provider call.
 */
export const embeddingBackfillLimit = 25;

/**
 * Gives newly approved Personal Context items the vectors retrieval needs.
 *
 * It runs after the brief rather than before it: embedding is a provider call,
 * and the Flash Brief is the part of the product with a five-second promise.
 * The cost is that the first scan after approving context still sends the
 * whole profile, which is correct output, only unoptimised.
 */
export async function processPersonalContextEmbedding(
  input: Readonly<{ accessToken: string }>,
  dependencies: PersonalContextEmbeddingDependencies,
): Promise<PersonalContextEmbeddingResult> {
  const generator = dependencies.createGenerator();

  if (!generator) {
    return { embedded: 0, status: "skipped" };
  }

  let session: EmbeddingSession | null;

  try {
    session = await dependencies.authenticate(input.accessToken);
  } catch {
    return { embedded: 0, status: "skipped" };
  }

  if (!session) {
    return { embedded: 0, status: "skipped" };
  }

  try {
    const items = await session.repository.listItemsMissingEmbedding(
      embeddingBackfillLimit,
    );

    if (items.length === 0) {
      return { embedded: 0, status: "skipped" };
    }

    const vectors = await generator.embed(items.map((item) => item.text));
    let embedded = 0;

    for (const [index, item] of items.entries()) {
      const vector = vectors[index];

      // The generator already guarantees one vector per text; this keeps a
      // future change from writing one item's vector onto another's row.
      if (!vector) {
        continue;
      }

      if (
        await session.repository.setItemEmbedding(
          item.id,
          toVectorLiteral(vector),
        )
      ) {
        embedded += 1;
      }
    }

    return { embedded, status: "completed" };
  } catch {
    // Non-blocking: without vectors the brief falls back to the whole profile.
    return { embedded: 0, status: "failed" };
  }
}

export async function processProductionPersonalContextEmbedding(input: {
  accessToken: string;
}): Promise<PersonalContextEmbeddingResult> {
  return processPersonalContextEmbedding(input, {
    async authenticate(accessToken) {
      return authenticateDatabaseSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
    createGenerator() {
      try {
        const configuration = readOpenAIEmbeddingConfig(process.env);
        return configuration
          ? new OpenAIEmbeddingGenerator(configuration)
          : null;
      } catch {
        return null;
      }
    },
  });
}
