import {
  CompanyContextGeneratorError,
  OpenAICompanyContextGenerator,
  type CompanyContextGenerator,
} from "@miraio/ai";
import {
  authenticateCompanyContextSession,
  CompanyContextRepositoryError,
  type CompanyContextClaim,
  type CompanyContextRepository,
} from "@miraio/db";
import type { CompanyContext, CompanyContextInput } from "@miraio/domain";

import {
  readOpenAICompanyContextConfig,
  readServerSupabaseConfig,
} from "./server-config";

type CompanyContextRepositoryPort = Readonly<{
  claimContext(
    scanId: string,
    provider: string,
    modelAlias: string,
  ): Promise<CompanyContextClaim | null>;
  completeContext(
    scanId: string,
    runId: string,
    context: CompanyContext,
    latencyMs: number,
  ): Promise<void>;
  failContext(scanId: string, runId: string, errorCode: string): Promise<void>;
  getContextInput(scanId: string): Promise<CompanyContextInput | null>;
}>;

type CompanyContextSession = Readonly<{
  repository: CompanyContextRepositoryPort;
  userId: string;
}>;

export type CompanyContextProcessorDependencies = Readonly<{
  authenticate(accessToken: string): Promise<CompanyContextSession | null>;
  createGenerator(): CompanyContextGenerator;
  modelAlias: string;
  nowMilliseconds(): number;
  provider: string;
}>;

export type CompanyContextProcessResult = Readonly<{
  status: "completed" | "skipped" | "failed";
}>;

type Failure = Readonly<{ code: string }>;

function classifyFailure(error: unknown): Failure {
  if (error instanceof CompanyContextGeneratorError) {
    return { code: error.code };
  }

  if (error instanceof CompanyContextRepositoryError) {
    if (error.code === "not_found") {
      return { code: "scan_not_found" };
    }

    return { code: "persistence_unavailable" };
  }

  return { code: "company_context_unavailable" };
}

async function safelyFail(
  repository: CompanyContextRepositoryPort,
  scanId: string,
  runId: string,
  failure: Failure,
): Promise<void> {
  try {
    // Gracefully advances scan to generating_brief even on failure so Flash
    // Brief can still run without company context.
    await repository.failContext(scanId, runId, failure.code);
  } catch {
    // Scan stays in fast_context; stale-claim cleanup handles it later.
  }
}

export async function processCompanyContext(
  input: Readonly<{ accessToken: string; scanId: string }>,
  dependencies: CompanyContextProcessorDependencies,
): Promise<CompanyContextProcessResult> {
  let session: CompanyContextSession | null;

  try {
    session = await dependencies.authenticate(input.accessToken);
  } catch {
    return { status: "skipped" };
  }

  if (!session) {
    return { status: "skipped" };
  }

  let claim: CompanyContextClaim | null;

  try {
    claim = await session.repository.claimContext(
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
    const contextInput = await session.repository.getContextInput(input.scanId);

    if (!contextInput) {
      await safelyFail(session.repository, input.scanId, claim.runId, {
        code: "scan_not_found",
      });

      return { status: "failed" };
    }

    const context = await dependencies.createGenerator().generate(contextInput);
    const latencyMs = Math.max(
      0,
      Math.round(dependencies.nowMilliseconds() - startedAt),
    );

    await session.repository.completeContext(
      input.scanId,
      claim.runId,
      context,
      latencyMs,
    );

    return { status: "completed" };
  } catch (error) {
    const failure = classifyFailure(error);
    await safelyFail(session.repository, input.scanId, claim.runId, failure);

    return { status: "failed" };
  }
}

export async function processProductionCompanyContext(input: {
  accessToken: string;
  scanId: string;
}): Promise<CompanyContextProcessResult> {
  let configuration:
    ReturnType<typeof readOpenAICompanyContextConfig> | undefined;

  try {
    configuration = readOpenAICompanyContextConfig(process.env);
  } catch {
    // Config missing — skip gracefully; scan advances to generating_brief via
    // the pipeline caller's fallback path.
    return { status: "skipped" };
  }

  return processCompanyContext(input, {
    async authenticate(accessToken) {
      return authenticateCompanyContextSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
    createGenerator() {
      return new OpenAICompanyContextGenerator(configuration!);
    },
    modelAlias: configuration.model,
    nowMilliseconds: () => performance.now(),
    provider: "openai",
  });
}

export function toCompanyContextRepositoryPort(
  repository: CompanyContextRepository,
): CompanyContextRepositoryPort {
  return repository;
}
