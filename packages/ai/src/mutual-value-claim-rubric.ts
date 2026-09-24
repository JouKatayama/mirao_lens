/**
 * Fact or hypothesis, as the Mutual Value prompt defines it.
 *
 * "Fact, hypothesis, and uncertainty must remain distinguishable" is a rule in
 * AGENTS.md and a locked v0.1 product decision, and `claim_type` is where the
 * rule is actually enforced: every GIVE and GET item carries one. The two
 * definitions lived inside the Mutual Value system prompt until a second reader
 * needed them, exactly as with `potential-score-rubric.ts` and
 * `identity-status-rubric.ts`.
 *
 * Rubric text and nothing else. Absent from `index.ts`; import by relative
 * path.
 */

export const mutualValueClaimTypes = ["fact", "hypothesis"] as const;

export type MutualValueClaimType = (typeof mutualValueClaimTypes)[number];

/** Verbatim from the prompt's strict-rules list, parentheses and all. */
export const mutualValueClaimTypeDescriptions: Readonly<
  Record<MutualValueClaimType, string>
> = {
  fact: "grounded in card data or explicit user context",
  hypothesis: "inferred or assumed",
};

/**
 * The strict-rules bullet, composed from the definitions above so the prompt
 * and the rubric cannot drift apart. Reproduces the wording that was inlined
 * there, byte for byte, including the two-space continuation indent; a test
 * pins it.
 */
export const mutualValueClaimRule = `- Distinguish facts (${mutualValueClaimTypeDescriptions.fact}) from
  hypotheses (${mutualValueClaimTypeDescriptions.hypothesis}). Use claim_type accordingly.`;

/**
 * The same distinction as a proposition, for an evaluator that answers with a
 * probability rather than a label. Phrased so that true means fact, which
 * keeps a returned number readable without a key.
 *
 * "Use claim_type accordingly" is left out: that is an instruction about
 * filling in a schema field, and an evaluator is not filling one in.
 */
export const mutualValueFactProposition = `This statement is a fact — ${mutualValueClaimTypeDescriptions.fact} — rather than a hypothesis, which would be ${mutualValueClaimTypeDescriptions.hypothesis}.`;
