import { describe, expect, it } from "vitest";

import {
  briefEvaluationDimensions,
  briefEvaluationScaleDescription,
  briefEvaluationScoreLevelDescriptions,
  briefEvaluationScoreLevels,
} from "./brief-evaluation-rubric";

describe("brief evaluation scale", () => {
  it("describes every level the scale declares", () => {
    expect(Object.keys(briefEvaluationScoreLevelDescriptions).sort()).toEqual(
      briefEvaluationScoreLevels.map(String),
    );
  });

  it("keeps the anchors saying what the prose says", () => {
    // Two readers now exist for one scale: `brief-judge.ts` is sent the prose
    // and a typed evaluator is sent the anchors. Levels 2 and 4 are new — the
    // prose never named them — but 1, 3 and 5 must not have drifted, or the
    // judge and the shadow evaluation stop measuring the same thing.
    expect(briefEvaluationScaleDescription).toContain("1 = unacceptable");
    expect(briefEvaluationScaleDescription).toContain("3 = acceptable");
    expect(briefEvaluationScaleDescription).toContain("5 = excellent");

    expect(briefEvaluationScoreLevelDescriptions["1"]).toContain(
      "Unacceptable",
    );
    expect(briefEvaluationScoreLevelDescriptions["3"]).toContain("Acceptable");
    expect(briefEvaluationScoreLevelDescriptions["5"]).toContain("Excellent");
  });

  it("carries the merely-inoffensive rule into the level it belongs to", () => {
    // The one substantive rule the prose states about a specific level. If it
    // lived only in the prose, an evaluator reading the anchors would not have
    // it, and 3 would drift upward into "fine, nothing wrong with it".
    expect(briefEvaluationScoreLevelDescriptions["3"]).toContain(
      "merely inoffensive is a 3, not a 5",
    );
    expect(briefEvaluationScaleDescription).toContain(
      "merely inoffensive is a 3, not a 5",
    );
  });

  it("adds no judgement of its own to what a dimension measures", () => {
    // The anchors say how far short a brief falls; what it falls short *of* is
    // the dimension description's job alone. An anchor that named a dimension
    // would silently re-weight that dimension against the other seven.
    for (const description of Object.values(
      briefEvaluationScoreLevelDescriptions,
    )) {
      for (const dimension of briefEvaluationDimensions) {
        expect(description).not.toContain(dimension);
      }
    }
  });
});
