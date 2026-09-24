import { describe, expect, it } from "vitest";

import {
  identityStatusDefinition,
  identityStatusInstructionBlock,
  identityStatusOptionDescriptions,
  identityStatusPromptOrder,
} from "./identity-status-rubric";

describe("identity status rubric", () => {
  it("reproduces the prompt section it was extracted from, byte for byte", () => {
    // Pinned rather than derived: this block is interpolated straight into the
    // Flash Brief system prompt, and US-006 hangs a product rule off the label
    // it produces. A rubric edit that reached the generator unnoticed would
    // move identity assessments with no ticket and no record.
    expect(identityStatusInstructionBlock)
      .toBe(`IDENTITY_STATUS — Assess how confidently the card data identifies this
specific individual. Choose exactly one value:
- "high_confidence": full name + company present AND email domain matches
  company domain, OR the name is demonstrably uncommon combined with a unique
  title/department.
- "medium_confidence": full name + company are present but email is absent or
  the domain does not match the company.
- "unresolved": name is null/blank, or only a single name with no company, or
  the data is too sparse to form a working hypothesis.
- "verified": do not use — this requires external confirmation not available
  from card data alone.`);
  });

  it("carries exactly the four values US-006 names", () => {
    expect([...identityStatusPromptOrder].sort()).toEqual([
      "high_confidence",
      "medium_confidence",
      "unresolved",
      "verified",
    ]);
    expect(Object.keys(identityStatusOptionDescriptions).sort()).toEqual([
      "high_confidence",
      "medium_confidence",
      "unresolved",
      "verified",
    ]);
  });

  it("keeps the generator and the evaluator reading the same words", () => {
    for (const description of Object.values(identityStatusOptionDescriptions)) {
      expect(identityStatusInstructionBlock).toContain(description);
    }

    // `identityStatusDefinition` wraps at a different column than the prompt
    // block does, so the shared phrase is checked either side of the break.
    expect(identityStatusDefinition).toContain("how confidently the card data");
    expect(identityStatusDefinition).toContain("identifies this specific");
  });

  it("does not soften the instruction that verified is unreachable", () => {
    // The evaluator is given the same "do not use" wording the generator has.
    // Rewording it into a describable outcome would quietly make `verified`
    // reachable from card data, which is the one thing US-006 forbids.
    expect(identityStatusOptionDescriptions.verified).toContain("do not use");
    expect(identityStatusOptionDescriptions.verified).toContain(
      "external confirmation",
    );
  });

  it("leaves the prior-status floor rule out of the label definitions", () => {
    // The floor is about carrying a previous scan forward, not about what the
    // labels mean. Folding it in would make the rubric unusable for assessing
    // a single card on its own.
    expect(identityStatusInstructionBlock).not.toContain(
      "prior_identity_status",
    );
  });
});
