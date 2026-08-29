import type { FlashBriefPublic, MutualValuePublic } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  runFlashBriefAssertions,
  runMutualValueAssertions,
} from "./eval-assertions";
import { flashBriefGoldenCases } from "./flash-brief-fixtures";
import { mutualValueGoldenCases } from "./mutual-value-fixtures";
import {
  computeOverall,
  evalDimensions,
  summarizeEvalResults,
  type EvalResult,
  type EvalScore,
} from "./eval-rubric";

// ─── Rubric tests ────────────────────────────────────────────────────────────

describe("eval rubric", () => {
  it("computeOverall returns mean of scores", () => {
    const scores: EvalScore[] = [
      { dimension: "grounding", score: 4 },
      { dimension: "safety", score: 2 },
    ];
    expect(computeOverall(scores)).toBe(3);
  });

  it("computeOverall returns 0 for empty scores", () => {
    expect(computeOverall([])).toBe(0);
  });

  it("summarizeEvalResults handles empty results", () => {
    const summary = summarizeEvalResults([]);
    expect(summary.case_count).toBe(0);
    expect(summary.overall_mean).toBe(0);
    for (const dim of evalDimensions) {
      expect(summary.dimension_means[dim]).toBe(0);
    }
  });

  it("summarizeEvalResults computes correct dimension means", () => {
    const results: EvalResult[] = [
      {
        case_name: "case-a",
        overall: 4,
        scores: [
          { dimension: "grounding", score: 4 },
          { dimension: "safety", score: 4 },
        ],
      },
      {
        case_name: "case-b",
        overall: 2,
        scores: [
          { dimension: "grounding", score: 2 },
          { dimension: "safety", score: 2 },
        ],
      },
    ];
    const summary = summarizeEvalResults(results);
    expect(summary.case_count).toBe(2);
    expect(summary.dimension_means.grounding).toBe(3);
    expect(summary.dimension_means.safety).toBe(3);
    expect(summary.overall_mean).toBe(3);
  });

  it("summarizeEvalResults returns 0 for dimensions with no scores", () => {
    const results: EvalResult[] = [
      {
        case_name: "case-a",
        overall: 3,
        scores: [{ dimension: "grounding", score: 3 }],
      },
    ];
    const summary = summarizeEvalResults(results);
    expect(summary.dimension_means.safety).toBe(0);
    expect(summary.dimension_means.grounding).toBe(3);
  });
});

// ─── Flash Brief assertion tests ─────────────────────────────────────────────

const goodFlashBrief: FlashBriefPublic = {
  identity_status: "medium_confidence",
  potential: "製造業DX分野での協業可能性がある",
  say_this: ["現在のDX推進の課題は何ですか？"],
  who: "山田さんは架空産業株式会社のPMで、プロダクト開発を担当している",
  why_you: "DXコンサルとして直接貢献できる接点がある",
};

describe("runFlashBriefAssertions", () => {
  it("passes all checks for a compliant output", () => {
    const cas = flashBriefGoldenCases.find(
      (c) => c.caseName === "japanese-corporate-networking",
    )!;
    const results = runFlashBriefAssertions(goodFlashBrief, cas);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it("fails forbidden_substrings check when output contains a forbidden string", () => {
    const cas = flashBriefGoldenCases.find(
      (c) => c.caseName === "japanese-corporate-networking",
    )!;
    const badOutput: FlashBriefPublic = {
      ...goodFlashBrief,
      who: "山田さんの情報は@example.invalidから取得しました",
    };
    const results = runFlashBriefAssertions(badOutput, cas);
    const forbidden = results.find((r) => r.name === "no_forbidden_substrings");
    expect(forbidden?.passed).toBe(false);
  });

  it("fails identity_status_allowed when status is not in allowed set", () => {
    const cas = flashBriefGoldenCases.find(
      (c) => c.caseName === "sole-proprietor",
    )!;
    // sole-proprietor only allows unresolved or medium_confidence
    const badOutput: FlashBriefPublic = {
      ...goodFlashBrief,
      identity_status: "verified",
    };
    const results = runFlashBriefAssertions(badOutput, cas);
    const allowed = results.find((r) => r.name === "identity_status_allowed");
    expect(allowed?.passed).toBe(false);
  });

  it("fails identity_status_floor when output is below prior floor", () => {
    const cas = flashBriefGoldenCases.find(
      (c) => c.caseName === "high-confidence-identity-floor",
    )!;
    // prior is high_confidence; output medium_confidence is below it
    const badOutput: FlashBriefPublic = {
      ...goodFlashBrief,
      identity_status: "medium_confidence",
    };
    const results = runFlashBriefAssertions(badOutput, cas);
    const floor = results.find((r) => r.name === "identity_status_floor");
    expect(floor?.passed).toBe(false);
  });

  it("passes identity_status_floor when output meets the prior floor", () => {
    const cas = flashBriefGoldenCases.find(
      (c) => c.caseName === "high-confidence-identity-floor",
    )!;
    const goodOutput: FlashBriefPublic = {
      ...goodFlashBrief,
      identity_status: "high_confidence",
    };
    const results = runFlashBriefAssertions(goodOutput, cas);
    const floor = results.find((r) => r.name === "identity_status_floor");
    expect(floor?.passed).toBe(true);
  });
});

// ─── Mutual Value assertion tests ────────────────────────────────────────────

const goodMutualValue: MutualValuePublic = {
  ask: [
    {
      question: "現在のDX推進で最優先のテーマは何ですか？",
      validates_hypothesis: "DXの課題が製造業特有である可能性",
    },
  ],
  bridge:
    "製造業DXの現場と経営の両方を経験したコンサルと、プロダクト開発現場のPMが持つ課題は相互補完的である",
  get: [
    {
      claim_type: "fact",
      evidence_ids: [],
      text: "架空産業のプロダクト開発部が直面している具体的な課題",
    },
  ],
  give: [
    {
      claim_type: "hypothesis",
      evidence_ids: [],
      text: "製造業DXプロジェクトの知見を提供できる可能性がある",
    },
  ],
  next_action: {
    action: "来週、DX推進の具体的な課題についてオンラインで30分話す機会を設ける",
    reason: "共通の課題感があり、早期に深掘りする価値がある",
    timing: "1週間以内",
  },
};

describe("runMutualValueAssertions", () => {
  it("passes all checks for a compliant output", () => {
    const cas = mutualValueGoldenCases.find(
      (c) => c.caseName === "fact-heavy-give-get",
    )!;
    const results = runMutualValueAssertions(goodMutualValue, cas);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it("fails claim_type_present check when required claim type is absent", () => {
    const cas = mutualValueGoldenCases.find(
      (c) => c.caseName === "mixed-claim-types",
    )!;
    // mixed-claim-types requires both fact and hypothesis
    const hypothesisOnly: MutualValuePublic = {
      ...goodMutualValue,
      get: [{ claim_type: "hypothesis", evidence_ids: [], text: "何かを学べる可能性" }],
      give: [{ claim_type: "hypothesis", evidence_ids: [], text: "何かを提供できる可能性" }],
    };
    const results = runMutualValueAssertions(hypothesisOnly, cas);
    const factCheck = results.find((r) => r.name === "claim_type_present:fact");
    expect(factCheck?.passed).toBe(false);
  });

  it("fails evidence_ids_empty when an item has non-empty evidence_ids", () => {
    const cas = mutualValueGoldenCases.find(
      (c) => c.caseName === "fact-heavy-give-get",
    )!;
    const withEvidence: MutualValuePublic = {
      ...goodMutualValue,
      give: [
        {
          claim_type: "hypothesis",
          evidence_ids: ["00000000-0000-4014-8000-000000000001"],
          text: "製造業DXの知見を提供できる",
        },
      ],
    };
    const results = runMutualValueAssertions(withEvidence, cas);
    const evidenceCheck = results.find((r) => r.name === "evidence_ids_empty");
    expect(evidenceCheck?.passed).toBe(false);
  });

  it("fails forbidden_substrings when output contains a forbidden name", () => {
    const cas = mutualValueGoldenCases.find(
      (c) => c.caseName === "minimal-data-fallback",
    )!;
    // minimal-data-fallback forbids fabricated person names like 田中
    const withFabricatedName: MutualValuePublic = {
      ...goodMutualValue,
      give: [
        {
          claim_type: "hypothesis",
          evidence_ids: [],
          text: "田中さんのニーズに合わせた提案ができる",
        },
      ],
    };
    const results = runMutualValueAssertions(withFabricatedName, cas);
    const forbidden = results.find((r) => r.name === "no_forbidden_substrings");
    expect(forbidden?.passed).toBe(false);
  });

  it("fails min_ask_count when ASK is empty", () => {
    const cas = mutualValueGoldenCases.find(
      (c) => c.caseName === "fact-heavy-give-get",
    )!;
    // normalizeMutualValue already rejects empty ASK, but the harness also checks.
    const noAsk = {
      ...goodMutualValue,
      ask: [] as MutualValuePublic["ask"],
    };
    const results = runMutualValueAssertions(noAsk as MutualValuePublic, cas);
    const askCheck = results.find((r) => r.name === "min_ask_count");
    expect(askCheck?.passed).toBe(false);
  });
});

// ─── Golden case coverage ────────────────────────────────────────────────────

describe("golden dataset coverage", () => {
  it("Flash Brief golden cases cover at least 15 distinct scenarios", () => {
    expect(flashBriefGoldenCases.length).toBeGreaterThanOrEqual(15);
    const names = new Set(flashBriefGoldenCases.map((c) => c.caseName));
    expect(names.size).toBe(flashBriefGoldenCases.length);
  });

  it("Mutual Value golden cases cover at least 10 distinct scenarios", () => {
    expect(mutualValueGoldenCases.length).toBeGreaterThanOrEqual(10);
    const names = new Set(mutualValueGoldenCases.map((c) => c.caseName));
    expect(names.size).toBe(mutualValueGoldenCases.length);
  });

  it("total golden cases (card + flash brief + mutual value) reach ≥ 30", () => {
    // Card extraction cases are in card-extraction-fixtures.ts (10 cases).
    const cardExtractionCount = 10;
    const total =
      cardExtractionCount +
      flashBriefGoldenCases.length +
      mutualValueGoldenCases.length;
    expect(total).toBeGreaterThanOrEqual(30);
  });

  it("all Flash Brief cases have unique caseNames", () => {
    const names = flashBriefGoldenCases.map((c) => c.caseName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all Mutual Value cases have unique caseNames", () => {
    const names = mutualValueGoldenCases.map((c) => c.caseName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all Flash Brief inputs have a valid meeting_goal", () => {
    const validGoals = new Set([
      "networking",
      "sales",
      "recruiting",
      "partnership",
      "learning_information_exchange",
      "other",
    ]);
    for (const cas of flashBriefGoldenCases) {
      expect(validGoals.has(cas.input.meeting_goal)).toBe(true);
    }
  });

  it("all Flash Brief cases have at least one allowed identity status", () => {
    for (const cas of flashBriefGoldenCases) {
      expect(cas.expectations.allowed_identity_statuses.length).toBeGreaterThan(0);
    }
  });
});
