import {
  createGetEventScansHandler,
  createPostEventScanHandler,
  EVENTS_OPTIONS,
  productionEventHandlerDependencies,
} from "../../../../../lib/event-handlers";

export const runtime = "nodejs";
export const GET = createGetEventScansHandler(
  productionEventHandlerDependencies,
);
export const POST = createPostEventScanHandler(
  productionEventHandlerDependencies,
);
export { EVENTS_OPTIONS as OPTIONS };
