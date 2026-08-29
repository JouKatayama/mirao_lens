import {
  createDeleteScanHandler,
  OPTIONS,
  productionDeleteScanHandlerDependencies,
} from "../../../../../lib/scan-handlers";

export const runtime = "nodejs";

export const DELETE = createDeleteScanHandler(
  productionDeleteScanHandlerDependencies,
);
export { OPTIONS };
