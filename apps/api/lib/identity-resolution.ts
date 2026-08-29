import {
  authenticateIdentityResolutionSession,
  type IdentityResolutionRepository,
} from "@miraio/db";

import { readServerSupabaseConfig } from "./server-config";

type IdentityResolutionRepositoryPort = Readonly<{
  resolve(scanId: string, userId: string): Promise<string>;
}>;

type IdentityResolutionSession = Readonly<{
  repository: IdentityResolutionRepositoryPort;
  userId: string;
}>;

export type IdentityResolutionProcessorDependencies = Readonly<{
  authenticate(accessToken: string): Promise<IdentityResolutionSession | null>;
}>;

export type IdentityResolutionResult = Readonly<{
  status: "completed" | "skipped" | "failed";
}>;

export async function processIdentityResolution(
  input: Readonly<{ accessToken: string; scanId: string }>,
  dependencies: IdentityResolutionProcessorDependencies,
): Promise<IdentityResolutionResult> {
  let session: IdentityResolutionSession | null;

  try {
    session = await dependencies.authenticate(input.accessToken);
  } catch {
    return { status: "skipped" };
  }

  if (!session) {
    return { status: "skipped" };
  }

  try {
    await session.repository.resolve(input.scanId, session.userId);
    return { status: "completed" };
  } catch {
    // Identity resolution failure is non-blocking: Flash Brief falls back to
    // card-data-only identity assessment (prior_identity_status will be null).
    return { status: "failed" };
  }
}

export async function processProductionIdentityResolution(input: {
  accessToken: string;
  scanId: string;
}): Promise<IdentityResolutionResult> {
  return processIdentityResolution(input, {
    async authenticate(accessToken) {
      return authenticateIdentityResolutionSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
  });
}

export function toIdentityResolutionRepositoryPort(
  repository: IdentityResolutionRepository,
): IdentityResolutionRepositoryPort {
  return repository;
}
