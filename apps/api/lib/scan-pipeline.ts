import { after } from "next/server";

import { processProductionCardEvidence } from "./card-evidence";
import { processProductionCardIntelligence } from "./card-intelligence";
import { processProductionCompanyContext } from "./company-context";
import { processProductionCompanyEvidence } from "./company-evidence";
import { processProductionFlashBrief } from "./flash-brief";
import { processProductionIdentityResolution } from "./identity-resolution";
import { processProductionMutualValue } from "./mutual-value";
import { processProductionPersonalContextEmbedding } from "./personal-context-embedding";

export type ScanPipelineInput = Readonly<{
  accessToken: string;
  scanId: string;
}>;

type StageResult = Readonly<{ status: string }>;

export type ScanPipelineStages = Readonly<{
  cardEvidence(input: ScanPipelineInput): Promise<unknown>;
  cardIntelligence(input: ScanPipelineInput): Promise<StageResult>;
  companyContext(input: ScanPipelineInput): Promise<StageResult>;
  companyEvidence(input: ScanPipelineInput): Promise<unknown>;
  flashBrief(input: ScanPipelineInput): Promise<StageResult>;
  identityResolution(input: ScanPipelineInput): Promise<unknown>;
  mutualValue(input: ScanPipelineInput): Promise<unknown>;
  personalContextEmbedding(input: ScanPipelineInput): Promise<unknown>;
}>;

/**
 * Runs every stage a scan still needs, starting from whatever status it is in.
 *
 * Each AI stage claims the scan only from its own precondition status, so a
 * stage the scan has already passed returns `skipped` and the next one picks
 * up. That makes the same sequence serve a fresh upload and a resume: it used
 * to live inline after the upload and bail out unless card extraction had just
 * completed, so a scan whose brief failed (and rolled back to card_ready) or
 * whose run was cut short had no way to reach the remaining stages.
 *
 * Evidence records are not claim-guarded, so each is written only when this
 * invocation completed the stage it describes.
 */
export async function runScanPipeline(
  input: ScanPipelineInput,
  stages: ScanPipelineStages,
): Promise<void> {
  const card = await stages.cardIntelligence(input);

  // A failed extraction is terminal for this invocation: the client re-uploads
  // the image (a new POST /v1/scans) to try again.
  if (card.status === "failed_retryable" || card.status === "failed_terminal") {
    return;
  }

  if (card.status === "completed") {
    await stages.cardEvidence(input);
  }

  const company = await stages.companyContext(input);

  if (company.status === "completed") {
    await stages.companyEvidence(input);
  }

  // Identity resolution is idempotent and database-only, so it runs whenever
  // a brief might follow. Gating it on company context would skip it for a
  // scan whose worker died mid-stage and was released by a resume.
  await stages.identityResolution(input);
  await stages.flashBrief(input);
  await stages.mutualValue(input);

  // Last, and deliberately: this embeds the user's approved context so a later
  // scan can retrieve the relevant part of it instead of sending all of it.
  // It is a provider call, and nothing already shown depends on it, so it must
  // not sit between the user and the brief.
  await stages.personalContextEmbedding(input);
}

export const productionScanPipelineStages: ScanPipelineStages = {
  cardEvidence: processProductionCardEvidence,
  cardIntelligence: processProductionCardIntelligence,
  companyContext: processProductionCompanyContext,
  companyEvidence: processProductionCompanyEvidence,
  flashBrief: processProductionFlashBrief,
  identityResolution: processProductionIdentityResolution,
  mutualValue: processProductionMutualValue,
  personalContextEmbedding: processProductionPersonalContextEmbedding,
};

export function scheduleScanPipeline(input: ScanPipelineInput): void {
  after(async () => {
    // Every stage already converts its own expected failures into a persisted,
    // sanitized failure row. This guard exists for the ones that cannot: a
    // missing server configuration read inside `authenticate`, or any
    // unforeseen throw. Without it the rejection escapes the `after` callback
    // and the remaining stages never run.
    //
    // The whole chain still runs inside the calling route's `maxDuration`, so
    // a platform-level cut mid-pipeline remains possible; see
    // `providerTimeoutMilliseconds` in packages/ai for the per-stage budget.
    // POST /v1/scans/:scanId/resume picks such a scan back up. A durable
    // queue is still the real fix.
    try {
      await runScanPipeline(input, productionScanPipelineStages);
    } catch {
      // Never log provider output or card content. The scan keeps whatever
      // status the last completed stage persisted.
    }
  });
}
