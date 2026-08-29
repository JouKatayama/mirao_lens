import {
  authenticateEvidenceSession,
  type EvidenceRepository,
} from "@miraio/db";

import { readServerSupabaseConfig } from "./server-config";

type CardEvidenceRepositoryPort = Readonly<{
  createCardEvidence(scanId: string, userId: string): Promise<string | null>;
}>;

type CardEvidenceSession = Readonly<{
  repository: CardEvidenceRepositoryPort;
  userId: string;
}>;

export type CardEvidenceProcessorDependencies = Readonly<{
  authenticate(accessToken: string): Promise<CardEvidenceSession | null>;
}>;

export type CardEvidenceResult = Readonly<{
  status: "completed" | "skipped" | "failed";
}>;

export async function processCardEvidence(
  input: Readonly<{ accessToken: string; scanId: string }>,
  dependencies: CardEvidenceProcessorDependencies,
): Promise<CardEvidenceResult> {
  let session: CardEvidenceSession | null;

  try {
    session = await dependencies.authenticate(input.accessToken);
  } catch {
    return { status: "skipped" };
  }

  if (!session) {
    return { status: "skipped" };
  }

  try {
    await session.repository.createCardEvidence(input.scanId, session.userId);
    return { status: "completed" };
  } catch {
    // Evidence creation is non-blocking; failure does not affect the scan pipeline.
    return { status: "failed" };
  }
}

export async function processProductionCardEvidence(input: {
  accessToken: string;
  scanId: string;
}): Promise<CardEvidenceResult> {
  return processCardEvidence(input, {
    async authenticate(accessToken) {
      return authenticateEvidenceSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  });
}

export function toCardEvidenceRepositoryPort(
  repository: EvidenceRepository,
): CardEvidenceRepositoryPort {
  return repository;
}
