import {
  CardExtractionError,
  OpenAICardExtractor,
  type CardExtractor,
} from "@miraio/ai";
import {
  authenticateCardIntelligenceSession,
  CardIntelligenceRepositoryError,
  type CardExtractionClaim,
  type DownloadedCardImage,
} from "@miraio/db";
import type { BusinessCardRecord, CardExtraction } from "@miraio/domain";

import {
  readOpenAICardExtractionConfig,
  readServerSupabaseConfig,
} from "./server-config";

type CardIntelligenceRepositoryPort = Readonly<{
  claimExtraction(
    scanId: string,
    provider: string,
    modelAlias: string,
  ): Promise<CardExtractionClaim | null>;
  completeExtraction(
    scanId: string,
    runId: string,
    extraction: CardExtraction,
    latencyMs: number,
  ): Promise<BusinessCardRecord>;
  deleteRawImage(scanId: string, rawImagePath: string): Promise<void>;
  downloadRawImage(rawImagePath: string): Promise<DownloadedCardImage>;
  failExtraction(
    scanId: string,
    runId: string,
    errorCode: string,
    terminal: boolean,
  ): Promise<void>;
}>;

type CardIntelligenceSession = Readonly<{
  repository: CardIntelligenceRepositoryPort;
  userId: string;
}>;

export type CardIntelligenceProcessorDependencies = Readonly<{
  authenticate(accessToken: string): Promise<CardIntelligenceSession | null>;
  createExtractor(): CardExtractor;
  modelAlias: string;
  nowMilliseconds(): number;
  provider: string;
}>;

export type CardIntelligenceProcessResult = Readonly<{
  rawImageDeleted: boolean;
  status: "completed" | "failed_retryable" | "failed_terminal" | "skipped";
}>;

type Failure = Readonly<{ code: string; terminal: boolean }>;

function classifyFailure(error: unknown): Failure {
  if (error instanceof CardExtractionError) {
    return {
      code: error.code,
      terminal: error.code === "configuration",
    };
  }

  if (error instanceof CardIntelligenceRepositoryError) {
    if (error.code === "not_found") {
      return { code: "raw_image_missing", terminal: true };
    }

    if (error.code === "storage_error") {
      return { code: "raw_image_unavailable", terminal: false };
    }

    return { code: "persistence_unavailable", terminal: false };
  }

  return { code: "card_extraction_unavailable", terminal: false };
}

async function safelyFail(
  repository: CardIntelligenceRepositoryPort,
  scanId: string,
  runId: string,
  failure: Failure,
): Promise<void> {
  try {
    await repository.failExtraction(
      scanId,
      runId,
      failure.code,
      failure.terminal,
    );
  } catch {
    // Keep provider/card content out of logs. A stale running claim expires.
  }
}

export async function processCardIntelligence(
  input: Readonly<{ accessToken: string; scanId: string }>,
  dependencies: CardIntelligenceProcessorDependencies,
): Promise<CardIntelligenceProcessResult> {
  let session: CardIntelligenceSession | null;

  try {
    session = await dependencies.authenticate(input.accessToken);
  } catch {
    return { rawImageDeleted: false, status: "skipped" };
  }

  if (!session) {
    return { rawImageDeleted: false, status: "skipped" };
  }

  let claim: CardExtractionClaim | null;

  try {
    claim = await session.repository.claimExtraction(
      input.scanId,
      dependencies.provider,
      dependencies.modelAlias,
    );
  } catch {
    return { rawImageDeleted: false, status: "skipped" };
  }

  if (!claim) {
    return { rawImageDeleted: false, status: "skipped" };
  }

  const startedAt = dependencies.nowMilliseconds();

  try {
    const image = await session.repository.downloadRawImage(claim.rawImagePath);
    const extraction = await dependencies.createExtractor().extract(image);
    const latencyMs = Math.max(
      0,
      Math.round(dependencies.nowMilliseconds() - startedAt),
    );

    await session.repository.completeExtraction(
      input.scanId,
      claim.runId,
      extraction,
      latencyMs,
    );

    try {
      await session.repository.deleteRawImage(input.scanId, claim.rawImagePath);
      return { rawImageDeleted: true, status: "completed" };
    } catch {
      return { rawImageDeleted: false, status: "completed" };
    }
  } catch (error) {
    const failure = classifyFailure(error);
    await safelyFail(session.repository, input.scanId, claim.runId, failure);

    return {
      rawImageDeleted: false,
      status: failure.terminal ? "failed_terminal" : "failed_retryable",
    };
  }
}

export async function processProductionCardIntelligence(input: {
  accessToken: string;
  scanId: string;
}): Promise<CardIntelligenceProcessResult> {
  let configuration:
    ReturnType<typeof readOpenAICardExtractionConfig> | undefined;

  try {
    configuration = readOpenAICardExtractionConfig(process.env);
  } catch {
    // Claim a sanitized terminal run so status does not remain extracting.
  }

  return processCardIntelligence(input, {
    async authenticate(accessToken) {
      return authenticateCardIntelligenceSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
    createExtractor() {
      if (!configuration) {
        throw new CardExtractionError("configuration");
      }

      return new OpenAICardExtractor(configuration);
    },
    modelAlias: configuration?.model ?? "unconfigured",
    nowMilliseconds: () => performance.now(),
    provider: "openai",
  });
}
