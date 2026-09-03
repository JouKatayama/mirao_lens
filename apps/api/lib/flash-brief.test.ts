import { describe, expect, it, vi } from "vitest";

import {
  processFlashBrief,
  type FlashBriefProcessorDependencies,
} from "./flash-brief";
import type { FlashBriefClaim } from "@miraio/db";
import type { FlashBrief, FlashBriefInput } from "@miraio/domain";

const scanId = "00000000-0000-0000-0000-000000000001";
const accessToken = "test-token";

const validBriefInput: FlashBriefInput = {
  card: {
    company: "XYZ株式会社",
    department: null,
    language: "ja",
    name: "山田 太郎",
    title: "プロダクトマネージャー",
  },
  locale: "ja",
  meeting_goal: "networking",
  personal_context: {
    current_company: "ABC Inc.",
    current_role: "UIデザイナー",
    items: [],
  },
};

const validBrief: FlashBrief = {
  identity_status: "unresolved",
  potential: "あなたのデザイン力が彼のプロダクトチームに貢献できます。",
  say_this: ["最近のプロダクト開発でどんな課題がありますか？"],
  who: "山田太郎さんはXYZ株式会社のプロダクトマネージャーです。",
  why_you: "あなたのUIデザイン経験と彼のプロダクト課題が重なります。",
};

const validClaim: FlashBriefClaim = { runId: "run-001" };

function makeRepository(overrides: Partial<{
  claimBrief: () => Promise<FlashBriefClaim | null>;
  completeBrief: () => Promise<void>;
  failBrief: () => Promise<void>;
  getFlashBriefInput: () => Promise<FlashBriefInput | null>;
}> = {}) {
  return {
    claimBrief: vi.fn().mockResolvedValue(validClaim),
    completeBrief: vi.fn().mockResolvedValue(undefined),
    failBrief: vi.fn().mockResolvedValue(undefined),
    getFlashBriefInput: vi.fn().mockResolvedValue(validBriefInput),
    ...overrides,
  };
}

function makeDependencies(
  repository = makeRepository(),
  overrides: Partial<FlashBriefProcessorDependencies> = {},
): FlashBriefProcessorDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({ repository, userId: "user-1" }),
    createGenerator: vi.fn().mockReturnValue({
      generate: vi.fn().mockResolvedValue(validBrief),
    }),
    modelAlias: "gpt-4o",
    nowMilliseconds: vi.fn().mockReturnValue(1000),
    provider: "openai",
    ...overrides,
  };
}

describe("processFlashBrief", () => {
  it("returns skipped when authentication fails", async () => {
    const deps = makeDependencies(makeRepository(), {
      authenticate: vi.fn().mockRejectedValue(new Error("auth error")),
    });

    const result = await processFlashBrief({ accessToken, scanId }, deps);
    expect(result.status).toBe("skipped");
  });

  it("returns skipped when authentication returns null session", async () => {
    const deps = makeDependencies(makeRepository(), {
      authenticate: vi.fn().mockResolvedValue(null),
    });

    const result = await processFlashBrief({ accessToken, scanId }, deps);
    expect(result.status).toBe("skipped");
  });

  it("returns skipped when claim returns null (already claimed or wrong status)", async () => {
    const repo = makeRepository({
      claimBrief: vi.fn().mockResolvedValue(null),
    });
    const deps = makeDependencies(repo);

    const result = await processFlashBrief({ accessToken, scanId }, deps);
    expect(result.status).toBe("skipped");
  });

  it("returns completed and calls completeBrief on success", async () => {
    const repo = makeRepository();
    const deps = makeDependencies(repo);

    const result = await processFlashBrief({ accessToken, scanId }, deps);

    expect(result.status).toBe("completed");
    expect(repo.completeBrief).toHaveBeenCalledWith(
      scanId,
      validClaim.runId,
      validBrief,
      expect.any(Number),
    );
  });

  it("returns failed and calls failBrief when input is not found", async () => {
    const repo = makeRepository({
      getFlashBriefInput: vi.fn().mockResolvedValue(null),
    });
    const deps = makeDependencies(repo);

    const result = await processFlashBrief({ accessToken, scanId }, deps);

    expect(result.status).toBe("failed");
    expect(repo.failBrief).toHaveBeenCalledWith(
      scanId,
      validClaim.runId,
      "scan_not_found",
    );
  });

  it("returns failed and calls failBrief when generator throws", async () => {
    const repo = makeRepository();
    const { FlashBriefGeneratorError } = await import("@miraio/ai");
    const deps = makeDependencies(repo, {
      createGenerator: vi.fn().mockReturnValue({
        generate: vi
          .fn()
          .mockRejectedValue(new FlashBriefGeneratorError("rate_limited")),
      }),
    });

    const result = await processFlashBrief({ accessToken, scanId }, deps);

    expect(result.status).toBe("failed");
    expect(repo.failBrief).toHaveBeenCalledWith(
      scanId,
      validClaim.runId,
      "rate_limited",
    );
  });

  it("returns failed gracefully even when failBrief itself throws", async () => {
    const repo = makeRepository({
      failBrief: vi.fn().mockRejectedValue(new Error("db down")),
      getFlashBriefInput: vi.fn().mockResolvedValue(null),
    });
    const deps = makeDependencies(repo);

    const result = await processFlashBrief({ accessToken, scanId }, deps);
    expect(result.status).toBe("failed");
  });

  it("passes correct model to generator", async () => {
    const generate = vi.fn().mockResolvedValue(validBrief);
    const repo = makeRepository();
    const deps = makeDependencies(repo, {
      createGenerator: vi.fn().mockReturnValue({ generate }),
    });

    await processFlashBrief({ accessToken, scanId }, deps);

    expect(generate).toHaveBeenCalledWith(validBriefInput);
  });
});
