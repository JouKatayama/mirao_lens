import {
  createAdminSupabaseClient,
  CleanupRepository,
} from "@miraio/db";

import { readCleanupConfig } from "./server-config";

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
      const expected = process.env.CLEANUP_SECRET?.trim();
      return !!expected && provided === expected;
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
