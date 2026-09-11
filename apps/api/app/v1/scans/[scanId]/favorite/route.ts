import {
  createPatchScanFavoriteHandler,
  productionScanFavoriteHandlerDependencies,
} from "../../../../../lib/scan-handlers";

export const runtime = "nodejs";

export const PATCH = createPatchScanFavoriteHandler(
  productionScanFavoriteHandlerDependencies,
);
