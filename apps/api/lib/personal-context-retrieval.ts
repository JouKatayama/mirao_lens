import { toVectorLiteral, type EmbeddingGenerator } from "@miraio/ai";
import type { FlashBriefInput } from "@miraio/domain";

/**
 * The text the Personal Context is matched against: who this person is, in the
 * words the card and the company context supply. Nothing inferred goes in, so
 * a wrong inference cannot steer which of the user's own items are retrieved.
 */
export function buildTargetContextText(input: FlashBriefInput): string {
  const company = input.company_context;

  return [
    input.card.company,
    input.card.department,
    input.card.title,
    company?.industry,
    company?.company_description,
    company?.role_scope,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" / ");
}

export type RetrievalDependencies = Readonly<{
  createGenerator(): EmbeddingGenerator | null;
  matchPersonalContext(
    embedding: string,
    limit: number,
  ): Promise<FlashBriefInput["personal_context"]["items"] | null>;
}>;

export const personalContextMatchLimit = 7;

/**
 * Replaces the full profile with the items that relate to this person.
 *
 * Every failure path returns the input untouched. Retrieval is an
 * optimisation: sending too much context costs tokens and dilutes the prompt,
 * while sending none would strip the product of the half of the analysis that
 * is about the user.
 */
export async function withRetrievedPersonalContext(
  input: FlashBriefInput,
  dependencies: RetrievalDependencies,
): Promise<FlashBriefInput> {
  const generator = dependencies.createGenerator();

  if (!generator) {
    return input;
  }

  const targetText = buildTargetContextText(input);

  // A card with no company, department or title says nothing to match against;
  // whatever came back would be the user's items in arbitrary order.
  if (targetText === "") {
    return input;
  }

  try {
    const [vector] = await generator.embed([targetText]);

    if (!vector) {
      return input;
    }

    const items = await dependencies.matchPersonalContext(
      toVectorLiteral(vector),
      personalContextMatchLimit,
    );

    return items && items.length > 0
      ? { ...input, personal_context: { ...input.personal_context, items } }
      : input;
  } catch {
    return input;
  }
}
