import { describe, expect, it, vi } from "vitest";

import { runScanPipeline, type ScanPipelineStages } from "./scan-pipeline";

const input = {
  accessToken: "valid-token",
  scanId: "00000000-0000-4000-8000-000000000501",
} as const;

type StageName = keyof ScanPipelineStages;

function stages(statuses: Partial<Record<StageName, string>> = {}): {
  calls: StageName[];
  value: ScanPipelineStages;
} {
  const calls: StageName[] = [];
  const stage = (name: StageName, fallback: string) =>
    vi.fn(async () => {
      calls.push(name);
      return { status: statuses[name] ?? fallback };
    });

  return {
    calls,
    value: {
      cardEvidence: stage("cardEvidence", "completed"),
      cardIntelligence: stage("cardIntelligence", "completed"),
      companyContext: stage("companyContext", "completed"),
      companyEvidence: stage("companyEvidence", "completed"),
      flashBrief: stage("flashBrief", "completed"),
      identityResolution: stage("identityResolution", "completed"),
      mutualValue: stage("mutualValue", "completed"),
    },
  };
}

describe("runScanPipeline", () => {
  it("runs every stage in order for a fresh upload", async () => {
    const { calls, value } = stages();

    await runScanPipeline(input, value);

    expect(calls).toEqual([
      "cardIntelligence",
      "cardEvidence",
      "companyContext",
      "companyEvidence",
      "identityResolution",
      "flashBrief",
      "mutualValue",
    ]);
    expect(value.flashBrief).toHaveBeenCalledWith(input);
  });

  it.each(["failed_retryable", "failed_terminal"])(
    "stops after a %s card extraction",
    async (status) => {
      const { calls, value } = stages({ cardIntelligence: status });

      await runScanPipeline(input, value);

      expect(calls).toEqual(["cardIntelligence"]);
    },
  );

  it("continues past a card stage the scan already passed", async () => {
    // A resumed card_ready scan: extraction is skipped, the brief still runs.
    const { calls, value } = stages({ cardIntelligence: "skipped" });

    await runScanPipeline(input, value);

    expect(calls).toEqual([
      "cardIntelligence",
      "companyContext",
      "companyEvidence",
      "identityResolution",
      "flashBrief",
      "mutualValue",
    ]);
  });

  it("does not record company evidence unless company context completed", async () => {
    const { calls, value } = stages({ companyContext: "failed" });

    await runScanPipeline(input, value);

    expect(calls).not.toContain("companyEvidence");
    expect(calls).toContain("flashBrief");
  });

  it("still offers Mutual Value its claim when the brief was skipped", async () => {
    // A resumed brief_ready scan: only Mutual Value has work left.
    const { calls, value } = stages({
      cardIntelligence: "skipped",
      companyContext: "skipped",
      flashBrief: "skipped",
    });

    await runScanPipeline(input, value);

    expect(calls.at(-1)).toBe("mutualValue");
    expect(calls).not.toContain("cardEvidence");
    expect(calls).not.toContain("companyEvidence");
  });
});
