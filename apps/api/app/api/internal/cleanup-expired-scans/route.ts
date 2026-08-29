import {
  createPostCleanupHandler,
  productionCleanupHandlerDependencies,
} from "../../../../lib/cleanup-handlers";

export const runtime = "nodejs";

export const POST = createPostCleanupHandler(
  productionCleanupHandlerDependencies,
);
