/**
 * Identity Status, as the Flash Brief prompt defines it.
 *
 * US-006 makes `verified | high_confidence | medium_confidence | unresolved` a
 * product decision, and the four definitions below are what separates them.
 * They lived only inside the Flash Brief system prompt until a second reader
 * needed them; extracting them here keeps the generator and any evaluator
 * reading one text, for the same reason `potential-score-rubric.ts` exists.
 *
 * Note what the four labels are *not*: a scale. They are named outcomes, so
 * they travel as a `choice` rather than a `score`, and the distribution over
 * them is the interesting part — the difference between "medium_confidence,
 * clearly" and "medium_confidence, but it was nearly unresolved" is invisible
 * in the label alone and is exactly the uncertainty US-006 is about.
 *
 * Rubric text and nothing else: no provider, no client, no network. Absent
 * from `index.ts`; import it by relative path.
 */

/**
 * Descending by confidence, as the prompt lists them. `verified` sits last
 * there because it is the excluded case rather than the top of the scale.
 */
export const identityStatusPromptOrder = [
  "high_confidence",
  "medium_confidence",
  "unresolved",
  "verified",
] as const;

export type IdentityStatusLabel = (typeof identityStatusPromptOrder)[number];

/**
 * Verbatim from the prompt, wrapping and continuation indents included.
 *
 * `verified` keeps its "do not use" wording rather than being softened for an
 * evaluator. That instruction is the definition: the value means external
 * confirmation happened, and card data alone can never establish it. An
 * evaluator that puts mass there anyway has found something worth looking at.
 */
export const identityStatusOptionDescriptions: Readonly<
  Record<IdentityStatusLabel, string>
> = {
  high_confidence: `full name + company present AND email domain matches
  company domain, OR the name is demonstrably uncommon combined with a unique
  title/department.`,

  medium_confidence: `full name + company are present but email is absent or
  the domain does not match the company.`,

  unresolved: `name is null/blank, or only a single name with no company, or
  the data is too sparse to form a working hypothesis.`,

  verified: `do not use — this requires external confirmation not available
  from card data alone.`,
};

/** What the label is *of*, shared by the generator and any evaluator. */
export const identityStatusDefinition = `Assess how confidently the card data
identifies this specific individual. Choose exactly one value.`;

const identityStatusOptionLines = identityStatusPromptOrder
  .map((label) => `- "${label}": ${identityStatusOptionDescriptions[label]}`)
  .join("\n");

/**
 * The IDENTITY_STATUS section of the Flash Brief system prompt, composed from
 * the pieces above so the prompt and the rubric cannot drift apart. It
 * reproduces the wording that was previously inlined there, byte for byte; a
 * test pins the whole block.
 *
 * The `prior_identity_status` floor rule that follows it in the prompt is
 * deliberately *not* here. That rule is about carrying a previous assessment
 * forward, not about what the four labels mean, and a shadow evaluation that
 * applied it would be scoring the floor rather than the card.
 */
export const identityStatusInstructionBlock = `IDENTITY_STATUS — Assess how confidently the card data identifies this
specific individual. Choose exactly one value:
${identityStatusOptionLines}`;
