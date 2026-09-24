import { describe, expect, it } from "vitest";

import {
  potentialScoreDefinition,
  potentialScoreInstructionBlock,
  potentialScoreLevelDescriptions,
  potentialScoreLevels,
} from "./potential-score-rubric";

describe("potential score rubric", () => {
  it("reproduces the prompt section it was extracted from, byte for byte", () => {
    // Pinned rather than derived. This block is interpolated straight into the
    // Flash Brief system prompt, so a change here changes what a production
    // model is told — and a rubric edit that reached the generator by accident
    // would move every POTENTIAL score with no ticket and no record.
    expect(potentialScoreInstructionBlock)
      .toBe(`POTENTIAL_SCORE — The same judgement as an integer from 1 to 5. This is an
explainable heuristic about the strength of the overlap, not a score for the
person: rate how much concrete, grounded common ground the POTENTIAL sentences
actually rest on.
- 5: several explicit overlaps with what the user offers or seeks.
- 4: one explicit overlap, clearly relevant to the meeting goal.
- 3: same industry or adjacent role, no explicit overlap.
- 2: only the meeting goal connects them.
- 1: the card is too sparse to see any connection.
The score must agree with the POTENTIAL sentences; never score higher than the
evidence you just described.`);
  });

  it("describes every level the scale declares", () => {
    // The decision contract enforces this too, but failing here names the
    // rubric as the culprit instead of the question that used it.
    expect(Object.keys(potentialScoreLevelDescriptions).sort()).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect([...potentialScoreLevels]).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the generator and the evaluator reading the same words", () => {
    // The evaluator gets `potentialScoreDefinition` and the level descriptions;
    // the generator gets the composed block. Both must contain the same text,
    // or the two scores are measurements of different scales.
    for (const description of Object.values(potentialScoreLevelDescriptions)) {
      expect(potentialScoreInstructionBlock).toContain(description);
    }

    expect(potentialScoreInstructionBlock).toContain(
      "explainable heuristic about the strength of the overlap",
    );
    expect(potentialScoreDefinition).toContain(
      "explainable heuristic about the strength of the overlap",
    );
  });
});
