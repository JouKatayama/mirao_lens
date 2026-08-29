import {
  createGetScansHandler,
  createPostScanHandler,
  OPTIONS,
  productionGetScansHandlerDependencies,
  productionScanDependencies,
} from "../../../lib/scan-handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = createGetScansHandler(productionGetScansHandlerDependencies);
export const POST = createPostScanHandler(productionScanDependencies);
export { OPTIONS };
