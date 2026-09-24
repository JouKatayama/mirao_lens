/**
 * The POTENTIAL score, 1 to 5.
 *
 * The product spec calls POTENTIAL an explainable heuristic rather than a score
 * for a person, and shows it as a "1–5 indicator + one-line rationale". The
 * five levels below are what that means, and until now they existed only as
 * prose inside the Flash Brief system prompt.
 *
 * That was survivable while one model both wrote the POTENTIAL sentences and
 * picked the number, and it stops being survivable the moment a second
 * evaluator scores the same thing: two copies of a scale produce two numbers
 * that cannot be compared, and the disagreement would read as a finding about
 * the brief rather than as a difference between two rubrics. So the generator's
 * prompt and the shadow evaluation both read from here.
 *
 * This module is rubric text and nothing else: no provider, no client, no
 * network. Like `brief-evaluation-rubric.ts` it is deliberately absent from
 * `index.ts`; import it by relative path.
 */

/** Ascending, as the decision contract requires. */
export const potentialScoreLevels = [1, 2, 3, 4, 5] as const;

/**
 * Descending, as the Flash Brief prompt lists them. The order is part of the
 * prompt's wording rather than a preference, so it is reproduced rather than
 * normalized.
 */
const potentialScorePromptOrder = ["5", "4", "3", "2", "1"] as const;

export type PotentialScoreLevelKey = (typeof potentialScorePromptOrder)[number];

/**
 * Verbatim from the prompt, sentence fragments and lower case included. They
 * read as the continuation of "rate how much ... common ground the POTENTIAL
 * sentences actually rest on", which is how both readers receive them.
 */
export const potentialScoreLevelDescriptions: Readonly<
  Record<PotentialScoreLevelKey, string>
> = {
  "1": "the card is too sparse to see any connection.",
  "2": "only the meeting goal connects them.",
  "3": "same industry or adjacent role, no explicit overlap.",
  "4": "one explicit overlap, clearly relevant to the meeting goal.",
  "5": "several explicit overlaps with what the user offers or seeks.",
};

/** What the score is *of*, shared by the generator and the evaluator. */
export const potentialScoreDefinition = `An integer from 1 to 5. This is an
explainable heuristic about the strength of the overlap, not a score for the
person: rate how much concrete, grounded common ground the POTENTIAL sentences
actually rest on.`;

const potentialScoreLevelLines = potentialScorePromptOrder
  .map((level) => `- ${level}: ${potentialScoreLevelDescriptions[level]}`)
  .join("\n");

/**
 * The POTENTIAL_SCORE section of the Flash Brief system prompt, composed from
 * the pieces above so that the prompt and the rubric cannot drift apart. It
 * reproduces the wording that was previously inlined there, byte for byte; a
 * test pins the whole block.
 */
export const potentialScoreInstructionBlock = `POTENTIAL_SCORE — The same judgement as an integer from 1 to 5. This is an
explainable heuristic about the strength of the overlap, not a score for the
person: rate how much concrete, grounded common ground the POTENTIAL sentences
actually rest on.
${potentialScoreLevelLines}
The score must agree with the POTENTIAL sentences; never score higher than the
evidence you just described.`;
