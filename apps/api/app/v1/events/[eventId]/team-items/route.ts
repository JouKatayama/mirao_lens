import {
  createSharedEventItemsHandler,
  EVENTS_OPTIONS,
  productionEventHandlerDependencies,
} from "../../../../../lib/event-handlers";

export const runtime = "nodejs";
export const GET = createSharedEventItemsHandler(
  productionEventHandlerDependencies,
);
export { EVENTS_OPTIONS as OPTIONS };
