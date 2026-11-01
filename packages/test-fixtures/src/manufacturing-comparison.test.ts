import { flashBriefInputSchema } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  dataRichnessLevels,
  manufacturingComparisonCases,
} from "./manufacturing-comparison-fixtures";
import {
  assignBlindLabels,
  blindLabels,
  comparisonConditions,
  ComparisonRatingError,
  formatManufacturingComparison,
  isSingleQuestion,
  summarizeManufacturingComparison,
  type BlindLabel,
  type CaseRating,
  type ComparisonCondition,
} from "./manufacturing-comparison-scoring";

function labelFor(
  caseName: string,
  condition: ComparisonCondition,
): BlindLabel {
  const assignment = assignBlindLabels(caseName);
  const label = blindLabels.find((entry) => assignment[entry] === condition);

  if (!label) {
    throw new Error("unassigned condition");
  }

  return label;
}

// Rates the given conditions best-to-worst; only `adopted` would be used.
function rate(
  caseName: string,
  order: readonly ComparisonCondition[],
  adopted: readonly ComparisonCondition[],
  misleading: readonly ComparisonCondition[] = [],
): CaseRating {
  return {
    case_name: caseName,
    data_richness: "thin",
    ratings: order.map((condition, index) => ({
      label: labelFor(caseName, condition),
      misleading: misleading.includes(condition),
      rank: (index + 1) as 1 | 2 | 3,
      would_use: adopted.includes(condition),
    })),
  };
}

describe("manufacturingComparisonCases", () => {
  it("covers 20-30 unique cases across every data richness level", () => {
    const names = manufacturingComparisonCases.map((entry) => entry.caseName);

    expect(names.length).toBeGreaterThanOrEqual(20);
    expect(names.length).toBeLessThanOrEqual(30);
    expect(new Set(names).size).toBe(names.length);
    expect(
      new Set(manufacturingComparisonCases.map((entry) => entry.data_richness)),
    ).toEqual(new Set(dataRichnessLevels));
  });

  it("builds valid Flash Brief inputs with fictional contact data only", () => {
    for (const entry of manufacturingComparisonCases) {
      expect(() => flashBriefInputSchema.parse(entry.input)).not.toThrow();
      expect(entry.input.opportunity_playbook).toBeUndefined();

      for (const value of [entry.input.card.email, entry.input.card.website]) {
        if (value) {
          expect(value).toMatch(/\.invalid$/);
        }
      }
    }
  });
});

describe("assignBlindLabels", () => {
  it("maps X, Y and Z to all three conditions, stably per case", () => {
    const assignment = assignBlindLabels("visual-inspection/food-quality");

    expect(new Set(Object.values(assignment))).toEqual(
      new Set(comparisonConditions),
    );
    expect(assignBlindLabels("visual-inspection/food-quality")).toEqual(
      assignment,
    );
  });

  it("varies the order across the case set", () => {
    const orders = new Set(
      manufacturingComparisonCases.map((entry) =>
        JSON.stringify(assignBlindLabels(entry.caseName)),
      ),
    );

    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("summarizeManufacturingComparison", () => {
  it("unblinds ratings and reports the playbook leading", () => {
    const summary = summarizeManufacturingComparison([
      rate("a", ["playbook", "current_miraio", "generic_chat"], ["playbook"]),
      rate(
        "b",
        ["playbook", "generic_chat", "current_miraio"],
        ["playbook", "generic_chat"],
      ),
    ]);
    const playbook = summary.overall.find(
      (entry) => entry.condition === "playbook",
    );

    expect(playbook).toMatchObject({
      adoption_rate: 1,
      first_place_count: 2,
      mean_rank: 1,
      rated: 2,
    });
    expect(summary.by_richness.thin).toEqual(summary.overall);
    expect(summary.by_richness.rich.every((entry) => entry.rated === 0)).toBe(
      true,
    );
    expect(summary.verdict).toBe("playbook_leads");
  });

  it("does not let a misleading playbook question lead", () => {
    const summary = summarizeManufacturingComparison([
      rate(
        "a",
        ["playbook", "current_miraio", "generic_chat"],
        ["playbook"],
        ["playbook"],
      ),
    ]);

    expect(summary.verdict).toBe("no_playbook_advantage");
  });

  it("reports incomplete with no ratings", () => {
    expect(summarizeManufacturingComparison([]).verdict).toBe("incomplete");
  });

  it("rejects a case that is not fully ranked", () => {
    expect(() =>
      summarizeManufacturingComparison([
        {
          case_name: "a",
          data_richness: "rich",
          ratings: [
            { label: "X", misleading: false, rank: 1, would_use: true },
            { label: "Y", misleading: false, rank: 1, would_use: true },
            { label: "Z", misleading: false, rank: 3, would_use: false },
          ],
        },
      ]),
    ).toThrow(ComparisonRatingError);
  });

  it("formats a readable summary", () => {
    const text = formatManufacturingComparison(
      summarizeManufacturingComparison([
        rate("a", ["playbook", "current_miraio", "generic_chat"], ["playbook"]),
      ]),
    );

    expect(text).toContain("C Playbook版: 採用 100%");
    expect(text).toContain("情報量 minimal:");
  });
});

describe("isSingleQuestion", () => {
  it("accepts exactly one question", () => {
    expect(isSingleQuestion("検査で人が判断している工程はありますか？")).toBe(
      true,
    );
  });

  it("rejects none, several, or an empty answer", () => {
    expect(isSingleQuestion("品質について話しましょう。")).toBe(false);
    expect(isSingleQuestion("何を作っていますか？課題は？")).toBe(false);
    expect(isSingleQuestion(null)).toBe(false);
  });
});
