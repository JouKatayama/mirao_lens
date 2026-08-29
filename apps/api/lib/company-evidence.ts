import {
  authenticateEvidenceSession,
  type EvidenceRepository,
} from "@miraio/db";

import { readServerSupabaseConfig } from "./server-config";

type CompanyEvidenceRepositoryPort = Readonly<{
  createCompanyContextEvidence(
    scanId: string,
    userId: string,
  ): Promise<string | null>;
}>;

type CompanyEvidenceSession = Readonly<{
  repository: CompanyEvidenceRepositoryPort;
  userId: string;
}>;

export type CompanyEvidenceProcessorDependencies = Readonly<{
  authenticate(accessToken: string): Promise<CompanyEvidenceSession | null>;
}>;

export type CompanyEvidenceResult = Readonly<{
  status: "completed" | "skipped" | "failed";
}>;

export async function processCompanyEvidence(
  input: Readonly<{ accessToken: string; scanId: string }>,
  dependencies: CompanyEvidenceProcessorDependencies,
): Promise<CompanyEvidenceResult> {
  let session: CompanyEvidenceSession | null;

  try {
    session = await dependencies.authenticate(input.accessToken);
  } catch {
    return { status: "skipped" };
  }

  if (!session) {
    return { status: "skipped" };
  }

  try {
    await session.repository.createCompanyContextEvidence(
      input.scanId,
      session.userId,
    );
    return { status: "completed" };
  } catch {
    // Evidence creation is non-blocking; failure does not affect the scan pipeline.
    return { status: "failed" };
  }
}

export async function processProductionCompanyEvidence(input: {
  accessToken: string;
  scanId: string;
}): Promise<CompanyEvidenceResult> {
  return processCompanyEvidence(input, {
    async authenticate(accessToken) {
      return authenticateEvidenceSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  });
}

export function toCompanyEvidenceRepositoryPort(
  repository: EvidenceRepository,
): CompanyEvidenceRepositoryPort {
  return repository;
}
