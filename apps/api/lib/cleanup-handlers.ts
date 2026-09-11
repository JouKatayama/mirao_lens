import { createHash, timingSafeEqual } from "node:crypto";

import { createAdminSupabaseClient, CleanupRepository } from "@miraio/db";

import { readCleanupConfig } from "./server-config";

/**
 * Compares a presented secret with the configured one in constant time. This
 * endpoint holds a service-role client, so a plain `===`, which returns at
 * the first differing character, would leak how much of a guess was right.
 * Hashing first gives both sides the same length, which timingSafeEqual needs.
 */
export function cleanupSecretMatches(
  provided: string,
  expected: string | undefined,
): boolean {
  const configured = expected?.trim();

  if (!configured || !provided) {
    return false;
  }

  const digest = (value: string) => createHash("sha256").update(value).digest();

  return timingSafeEqual(digest(provided), digest(configured));
}

export type CleanupHandlerDependencies = Readonly<{
  verifySecret(provided: string): boolean;
  sweepExpiredImages(): Promise<{ deleted: number; failed: number }>;
}>;

export function createPostCleanupHandler(
  dependencies: CleanupHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const provided = request.headers.get("x-cleanup-secret")?.trim() ?? "";

    if (!dependencies.verifySecret(provided)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    try {
      const { deleted, failed } = await dependencies.sweepExpiredImages();
      return Response.json({
        deleted_count: deleted,
        failed_count: failed,
        status: "ok",
      });
    } catch {
      return Response.json({ error: "sweep_failed" }, { status: 500 });
    }
  };
}

export const productionCleanupHandlerDependencies: CleanupHandlerDependencies =
  {
    verifySecret(provided) {
      return cleanupSecretMatches(provided, process.env.CLEANUP_SECRET);
    },
    async sweepExpiredImages() {
      const config = readCleanupConfig(process.env);
      const client = createAdminSupabaseClient(
        config.supabaseUrl,
        config.serviceRoleKey,
      );
      const repo = new CleanupRepository(client);
      return repo.sweepExpiredRawImages(100, new Date());
    },
  };
