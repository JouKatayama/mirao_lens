import { selectOpportunityPlaybookHints } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import { manufacturingOpportunityPlaybook } from "./manufacturing-playbook";

describe("manufacturingOpportunityPlaybook", () => {
  it("holds the 20-30 entries the v0.1 review targets, with unique ids", () => {
    const ids = manufacturingOpportunityPlaybook.map((entry) => entry.id);

    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(ids.length).toBeLessThanOrEqual(30);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("phrases every suggested question as one question", () => {
    for (const entry of manufacturingOpportunityPlaybook) {
      expect(entry.suggested_question.endsWith("？")).toBe(true);
    }
  });

  it("covers each theme of the strategy", () => {
    const themes = new Set(
      manufacturingOpportunityPlaybook.map((entry) => entry.theme),
    );

    expect([...themes].sort()).toEqual([
      "equipment_maintenance",
      "equipment_software",
      "factory_dx",
      "manufacturing_data",
      "production_planning",
      "quality_assurance",
      "visual_inspection",
    ]);
  });

  it("leads with an inspection question for a quality lead and an inspection-AI seller", () => {
    const [first] = selectOpportunityPlaybookHints(
      {
        offeringTexts: ["外観検査AIの営業責任者"],
        targetTexts: ["食品メーカー", "品質保証部", "課長"],
      },
      manufacturingOpportunityPlaybook,
    );

    expect(first?.theme).toBe("visual_inspection");
  });

  it("leads with a maintenance question for a maintenance engineer and a predictive-maintenance seller", () => {
    const [first] = selectOpportunityPlaybookHints(
      {
        offeringTexts: ["設備IoT・予知保全"],
        targetTexts: ["自動車部品メーカー", "設備保全課"],
      },
      manufacturingOpportunityPlaybook,
    );

    expect(first?.theme).toBe("equipment_maintenance");
  });
});
