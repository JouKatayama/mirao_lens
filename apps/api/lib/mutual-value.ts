import {
  MutualValueGeneratorError,
  OpenAIMutualValueGenerator,
  type MutualValueGenerator,
} from "@miraio/ai";
import {
  authenticateMutualValueSession,
  MutualValueRepositoryError,
  type MutualValueClaim,
  type MutualValueRepository,
} from "@miraio/db";
import type { MutualValue, MutualValueInput } from "@miraio/domain";

import {
  readOpenAIMutualValueConfig,
  readServerSupabaseConfig,
} from "./server-config";

type MutualValueRepositoryPort = Readonly<{
  claimMutualValue(
    scanId: string,
    provider: string,
    modelAlias: string,
  ): Promise<MutualValueClaim | null>;
  completeMutualValue(
    scanId: string,
    runId: string,
    mutualValue: MutualValue,
    latencyMs: number,
  ): Promise<void>;
  failMutualValue(
    scanId: string,
    runId: string,
    errorCode: string,
  ): Promise<void>;
  getMutualValueInput(scanId: string): Promise<MutualValueInput | null>;
  linkEvidenceIds(scanId: string, mutualValue: MutualValue): Promise<MutualValue>;
}>;

type MutualValueSession = Readonly<{
  repository: MutualValueRepositoryPort;
  userId: string;
}>;

export type MutualValueProcessorDependencies = Readonly<{
  authenticate(accessToken: string): Promise<MutualValueSession | null>;
  createGenerator(): MutualValueGenerator;
  modelAlias: string;
  nowMilliseconds(): number;
  provider: string;
}>;

export type MutualValueProcessResult = Readonly<{
  status: "completed" | "skipped" | "failed";
}>;

type Failure = Readonly<{ code: string }>;

function classifyFailure(error: unknown): Failure {
  if (error instanceof MutualValueGeneratorError) {
    return { code: error.code };
  }

  if (error instanceof MutualValueRepositoryError) {
    if (error.code === "not_found") {
      return { code: "scan_not_found" };
    }

    return { code: "persistence_unavailable" };
  }

  return { code: "mutual_value_unavailable" };
}

async function safelyFail(
  repository: MutualValueRepositoryPort,
  scanId: string,
  runId: string,
  failure: Failure,
): Promise<void> {
  try {
    await repository.failMutualValue(scanId, runId, failure.code);
  } catch {
    // Scan rolls back to brief_ready on next stale-claim cleanup.
  }
}

export async function processMutualValue(
  input: Readonly<{ accessToken: string; scanId: string }>,
  dependencies: MutualValueProcessorDependencies,
): Promise<MutualValueProcessResult> {
  let session: MutualValueSession | null;

  try {
    session = await dependencies.authenticate(input.accessToken);
  } catch {
    return { status: "skipped" };
  }

  if (!session) {
    return { status: "skipped" };
  }

  let claim: MutualValueClaim | null;

  try {
    claim = await session.repository.claimMutualValue(
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
    const mutualValueInput = await session.repository.getMutualValueInput(
      input.scanId,
    );

    if (!mutualValueInput) {
      await safelyFail(session.repository, input.scanId, claim.runId, {
        code: "scan_not_found",
      });

      return { status: "failed" };
    }

    const rawMutualValue = await dependencies
      .createGenerator()
      .generate(mutualValueInput);
    const latencyMs = Math.max(
      0,
      Math.round(dependencies.nowMilliseconds() - startedAt),
    );

    // Link evidence IDs to give/get items by claim_type (non-blocking on
    // failure; raw output is stored if evidence lookup fails).
    let mutualValue = rawMutualValue;
    try {
      mutualValue = await session.repository.linkEvidenceIds(
        input.scanId,
        rawMutualValue,
      );
    } catch {
      // Keep rawMutualValue with empty evidence_ids.
    }

    await session.repository.completeMutualValue(
      input.scanId,
      claim.runId,
      mutualValue,
      latencyMs,
    );

    return { status: "completed" };
  } catch (error) {
    const failure = classifyFailure(error);
    await safelyFail(session.repository, input.scanId, claim.runId, failure);

    return { status: "failed" };
  }
}

export async function processProductionMutualValue(input: {
  accessToken: string;
  scanId: string;
}): Promise<MutualValueProcessResult> {
  let configuration:
    ReturnType<typeof readOpenAIMutualValueConfig> | undefined;

  try {
    configuration = readOpenAIMutualValueConfig(process.env);
  } catch {
    // Config missing — skip silently; brief_ready state remains accessible.
    return { status: "skipped" };
  }

  return processMutualValue(input, {
    async authenticate(accessToken) {
      return authenticateMutualValueSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
    createGenerator() {
      return new OpenAIMutualValueGenerator(configuration!);
    },
    modelAlias: configuration.model,
    nowMilliseconds: () => performance.now(),
    provider: "openai",
  });
}

// Type helper: narrows the repository to the port expected by this module.
export function toMutualValueRepositoryPort(
  repository: MutualValueRepository,
): MutualValueRepositoryPort {
  return repository;
}
