import { describe, expect, it } from "vitest";

import {
  flashBriefInputSchema,
  opportunityPlaybookEntrySchema,
  selectOpportunityPlaybookHints,
  type OpportunityPlaybookEntry,
} from "../index";

function entry(
  overrides: Partial<OpportunityPlaybookEntry> &
    Pick<OpportunityPlaybookEntry, "id">,
): OpportunityPlaybookEntry {
  return opportunityPlaybookEntrySchema.parse({
    fact_status: "hypothesis",
    industry: "manufacturing",
    offering_signals: ["外観検査"],
    potential_offerings: ["検査の自動化"],
    problem_hypothesis: "目視検査の工数が残っている",
    provenance: "generalized_industry_knowledge",
    suggested_next_action: "対象工程を確認する",
    suggested_question: "人が判断している検査工程はありますか？",
    target_departments: ["品質保証"],
    target_signals: ["品質"],
    theme: "visual_inspection",
    verification_dimensions: ["判定工程"],
    ...overrides,
  });
}

const inspection = entry({ id: "test-inspection-001" });
const maintenance = entry({
  id: "test-maintenance-001",
  offering_signals: ["予知保全"],
  target_signals: ["保全"],
  theme: "equipment_maintenance",
});
const aiOffering = entry({
  id: "test-ai-001",
  offering_signals: ["AI"],
  target_signals: ["経営企画"],
  theme: "factory_dx",
});

describe("opportunityPlaybookEntrySchema", () => {
  it("only accepts entries labelled as hypotheses", () => {
    expect(() =>
      opportunityPlaybookEntrySchema.parse({
        ...inspection,
        fact_status: "fact",
      }),
    ).toThrow();
  });
});

describe("selectOpportunityPlaybookHints", () => {
  it("ranks entries matching the person above offering-only matches", () => {
    const hints = selectOpportunityPlaybookHints(
      {
        offeringTexts: ["予知保全サービスを提供"],
        targetTexts: ["食品メーカー", "品質保証部"],
      },
      [maintenance, inspection],
    );

    expect(hints.map((hint) => hint.id)).toEqual([
      "test-inspection-001",
      "test-maintenance-001",
    ]);
    expect(hints[0]?.matched_target_signals).toEqual(["品質"]);
    expect(hints[1]?.matched_offering_signals).toEqual(["予知保全"]);
  });

  it("ranks a person match above any number of offering-only matches", () => {
    const planning = entry({
      id: "test-planning-001",
      offering_signals: ["スケジューリング"],
      target_signals: ["生産管理"],
      theme: "production_planning",
    });
    const inspectionHeavy = entry({
      id: "test-inspection-heavy-001",
      offering_signals: ["外観検査", "画像解析", "検査AI"],
      target_signals: ["品質"],
    });

    const [first] = selectOpportunityPlaybookHints(
      {
        offeringTexts: ["外観検査AI 画像解析"],
        targetTexts: ["機械メーカー", "生産管理部"],
      },
      [inspectionHeavy, planning],
    );

    expect(first?.id).toBe("test-planning-001");
  });

  it("ignores an offering match when the person is not in manufacturing", () => {
    expect(
      selectOpportunityPlaybookHints(
        { offeringTexts: ["予知保全"], targetTexts: ["銀行", "人事部"] },
        [maintenance],
      ),
    ).toEqual([]);
  });

  it("returns nothing for a card without target text", () => {
    expect(
      selectOpportunityPlaybookHints(
        { offeringTexts: ["外観検査"], targetTexts: [null, " "] },
        [inspection],
      ),
    ).toEqual([]);
  });

  it("matches Latin signals only at the start of a word", () => {
    const select = (offering: string) =>
      selectOpportunityPlaybookHints(
        { offeringTexts: [offering], targetTexts: ["工場"] },
        [aiOffering],
      );

    expect(select("predictive maintenance")).toEqual([]);
    expect(select("製造業向けＡＩエージェント")).toHaveLength(1);
  });

  it("is deterministic and respects the limit", () => {
    const input = {
      offeringTexts: ["外観検査 予知保全"],
      targetTexts: ["工場", "品質保全"],
    };
    const first = selectOpportunityPlaybookHints(
      input,
      [maintenance, inspection],
      1,
    );

    expect(first).toHaveLength(1);
    expect(
      selectOpportunityPlaybookHints(input, [inspection, maintenance], 1),
    ).toEqual(first);
  });

  it("produces hints the Flash Brief input accepts", () => {
    const hints = selectOpportunityPlaybookHints(
      { offeringTexts: ["外観検査"], targetTexts: ["品質保証部"] },
      [inspection],
    );

    expect(() =>
      flashBriefInputSchema.parse({
        card: {
          company: "サンプル製作所",
          department: "品質保証部",
          language: "ja",
          name: null,
          title: null,
        },
        meeting_goal: "sales",
        opportunity_playbook: hints,
        personal_context: {
          current_company: null,
          current_role: null,
          items: [],
        },
      }),
    ).not.toThrow();
  });
});
