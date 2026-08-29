import { describe, expect, it } from "vitest";

import { MutualValueGeneratorError } from "@miraio/ai";
import { MutualValueRepositoryError } from "@miraio/db";

import { processMutualValue } from "./mutual-value";
import type { MutualValueProcessorDependencies } from "./mutual-value";

const validMutualValueInput = {
  card: { name: "山田 太郎", company: "XYZ株式会社", department: null, title: "PM", language: "ja" },
  flash_brief: {
    who: "山田さんはXYZ社のPMです",
    why_you: "プロダクト開発の観点が近い",
    say_this: ["最近注力している機能は何ですか？"],
    potential: "共同開発の可能性あり",
  },
  locale: "ja" as const,
  meeting_goal: "networking" as const,
  personal_context: {
    current_company: "ABC Inc.",
    current_role: "UIデザイナー",
    items: [],
  },
};

const validMutualValue = {
  give: [{ text: "UXリサーチの知見", claim_type: "hypothesis" as const, evidence_ids: [] }],
  get: [{ text: "市場展開事例", claim_type: "hypothesis" as const, evidence_ids: [] }],
  bridge: "両者ともデジタル製品に注力",
  ask: [{ question: "課題は何ですか？", validates_hypothesis: null }],
  next_action: { action: "来週話す", timing: "1週間以内", reason: "相乗効果" },
};

function makeDeps(
  overrides: Partial<MutualValueProcessorDependencies> = {},
): MutualValueProcessorDependencies {
  return {
    authenticate: async () => ({
      repository: {
        claimMutualValue: async () => ({ runId: "run-001" }),
        completeMutualValue: async () => {},
        failMutualValue: async () => {},
        getMutualValueInput: async () => validMutualValueInput,
        linkEvidenceIds: async (_scanId, mv) => mv,
      },
      userId: "user-001",
    }),
    createGenerator: () => ({
      generate: async () => validMutualValue,
    }),
    modelAlias: "gpt-4o",
    nowMilliseconds: () => 0,
    provider: "openai",
    ...overrides,
  };
}

describe("processMutualValue", () => {
  it("returns skipped when authentication fails", async () => {
    const deps = makeDeps({
      authenticate: async () => { throw new Error("auth error"); },
    });
    const result = await processMutualValue({ accessToken: "t", scanId: "s" }, deps);
    expect(result.status).toBe("skipped");
  });

  it("returns skipped when authenticate returns null", async () => {
    const deps = makeDeps({ authenticate: async () => null });
    const result = await processMutualValue({ accessToken: "t", scanId: "s" }, deps);
    expect(result.status).toBe("skipped");
  });

  it("returns skipped when claim returns null (already running or wrong status)", async () => {
    const deps = makeDeps({
      authenticate: async () => ({
        repository: {
          claimMutualValue: async () => null,
          completeMutualValue: async () => {},
          failMutualValue: async () => {},
          getMutualValueInput: async () => validMutualValueInput,
          linkEvidenceIds: async (_scanId, mv) => mv,
        },
        userId: "user-001",
      }),
    });
    const result = await processMutualValue({ accessToken: "t", scanId: "s" }, deps);
    expect(result.status).toBe("skipped");
  });

  it("returns completed on success", async () => {
    const result = await processMutualValue(
      { accessToken: "t", scanId: "s" },
      makeDeps(),
    );
    expect(result.status).toBe("completed");
  });

  it("returns failed and calls failMutualValue when input is null", async () => {
    let failCalled = false;
    const deps = makeDeps({
      authenticate: async () => ({
        repository: {
          claimMutualValue: async () => ({ runId: "run-001" }),
          completeMutualValue: async () => {},
          failMutualValue: async () => { failCalled = true; },
          getMutualValueInput: async () => null,
          linkEvidenceIds: async (_scanId, mv) => mv,
        },
        userId: "user-001",
      }),
    });
    const result = await processMutualValue({ accessToken: "t", scanId: "s" }, deps);
    expect(result.status).toBe("failed");
    expect(failCalled).toBe(true);
  });

  it("returns failed and calls failMutualValue when generator throws", async () => {
    let failCode: string | undefined;
    const deps = makeDeps({
      authenticate: async () => ({
        repository: {
          claimMutualValue: async () => ({ runId: "run-001" }),
          completeMutualValue: async () => {},
          failMutualValue: async (_s, _r, code) => { failCode = code; },
          getMutualValueInput: async () => validMutualValueInput,
          linkEvidenceIds: async (_scanId, mv) => mv,
        },
        userId: "user-001",
      }),
      createGenerator: () => ({
        generate: async () => {
          throw new MutualValueGeneratorError("rate_limited");
        },
      }),
    });
    const result = await processMutualValue({ accessToken: "t", scanId: "s" }, deps);
    expect(result.status).toBe("failed");
    expect(failCode).toBe("rate_limited");
  });

  it("returns failed gracefully even when failMutualValue itself throws", async () => {
    const deps = makeDeps({
      authenticate: async () => ({
        repository: {
          claimMutualValue: async () => ({ runId: "run-001" }),
          completeMutualValue: async () => {},
          failMutualValue: async () => { throw new MutualValueRepositoryError("fail"); },
          getMutualValueInput: async () => null,
          linkEvidenceIds: async (_scanId, mv) => mv,
        },
        userId: "user-001",
      }),
    });
    const result = await processMutualValue({ accessToken: "t", scanId: "s" }, deps);
    expect(result.status).toBe("failed");
  });
});
