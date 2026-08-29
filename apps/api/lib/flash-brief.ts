import {
  FlashBriefGeneratorError,
  OpenAIFlashBriefGenerator,
  type FlashBriefGenerator,
} from "@miraio/ai";
import {
  authenticateFlashBriefSession,
  FlashBriefRepositoryError,
  type FlashBriefClaim,
  type FlashBriefRepository,
} from "@miraio/db";
import type { FlashBrief, FlashBriefInput } from "@miraio/domain";

import {
  readOpenAIFlashBriefConfig,
  readServerSupabaseConfig,
} from "./server-config";

type FlashBriefRepositoryPort = Readonly<{
  claimBrief(
    scanId: string,
    provider: string,
    modelAlias: string,
  ): Promise<FlashBriefClaim | null>;
  completeBrief(
    scanId: string,
    runId: string,
    brief: FlashBrief,
    latencyMs: number,
  ): Promise<void>;
  failBrief(scanId: string, runId: string, errorCode: string): Promise<void>;
  getFlashBriefInput(scanId: string): Promise<FlashBriefInput | null>;
}>;

type FlashBriefSession = Readonly<{
  repository: FlashBriefRepositoryPort;
  userId: string;
}>;

export type FlashBriefProcessorDependencies = Readonly<{
  authenticate(accessToken: string): Promise<FlashBriefSession | null>;
  createGenerator(): FlashBriefGenerator;
  modelAlias: string;
  nowMilliseconds(): number;
  provider: string;
}>;

export type FlashBriefProcessResult = Readonly<{
  status: "completed" | "skipped" | "failed";
}>;

type Failure = Readonly<{ code: string }>;

function classifyFailure(error: unknown): Failure {
  if (error instanceof FlashBriefGeneratorError) {
    return { code: error.code };
  }

  if (error instanceof FlashBriefRepositoryError) {
    if (error.code === "not_found") {
      return { code: "scan_not_found" };
    }

    return { code: "persistence_unavailable" };
  }

  return { code: "flash_brief_unavailable" };
}

async function safelyFail(
  repository: FlashBriefRepositoryPort,
  scanId: string,
  runId: string,
  failure: Failure,
): Promise<void> {
  try {
    await repository.failBrief(scanId, runId, failure.code);
  } catch {
    // Scan rolls back to card_ready on next stale-claim cleanup.
  }
}

export async function processFlashBrief(
  input: Readonly<{ accessToken: string; scanId: string }>,
  dependencies: FlashBriefProcessorDependencies,
): Promise<FlashBriefProcessResult> {
  let session: FlashBriefSession | null;

  try {
    session = await dependencies.authenticate(input.accessToken);
  } catch {
    return { status: "skipped" };
  }

  if (!session) {
    return { status: "skipped" };
  }

  let claim: FlashBriefClaim | null;

  try {
    claim = await session.repository.claimBrief(
      input.scanId,
      dependencies.provider,
      dependencies.modelAlias,
    );
  } catch {
    return { status: "skipped" };
  }

  if (!claim) {
    return { status: "skipped" };
  }

  const startedAt = dependencies.nowMilliseconds();

  try {
    const briefInput = await session.repository.getFlashBriefInput(input.scanId);

    if (!briefInput) {
      await safelyFail(session.repository, input.scanId, claim.runId, {
        code: "scan_not_found",
      });

      return { status: "failed" };
    }

    const brief = await dependencies.createGenerator().generate(briefInput);
    const latencyMs = Math.max(
      0,
      Math.round(dependencies.nowMilliseconds() - startedAt),
    );

    await session.repository.completeBrief(
      input.scanId,
      claim.runId,
      brief,
      latencyMs,
    );

    return { status: "completed" };
  } catch (error) {
    const failure = classifyFailure(error);
    await safelyFail(session.repository, input.scanId, claim.runId, failure);

    return { status: "failed" };
  }
}

export async function processProductionFlashBrief(input: {
  accessToken: string;
  scanId: string;
}): Promise<FlashBriefProcessResult> {
  let configuration:
    ReturnType<typeof readOpenAIFlashBriefConfig> | undefined;

  try {
    configuration = readOpenAIFlashBriefConfig(process.env);
  } catch {
    // Config missing — skip silently; card_ready state remains accessible.
    return { status: "skipped" };
  }

  return processFlashBrief(input, {
    async authenticate(accessToken) {
      return authenticateFlashBriefSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
    createGenerator() {
      return new OpenAIFlashBriefGenerator(configuration!);
    },
    modelAlias: configuration.model,
    nowMilliseconds: () => performance.now(),
    provider: "openai",
  });
}

// Type helper: narrows the repository to the port expected by this module.
export function toFlashBriefRepositoryPort(
  repository: FlashBriefRepository,
): FlashBriefRepositoryPort {
  return repository;
}
