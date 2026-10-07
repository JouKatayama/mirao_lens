import {
  createSharedEventsHandler,
  EVENTS_OPTIONS,
  productionEventHandlerDependencies,
} from "../../../../lib/event-handlers";

export const runtime = "nodejs";
export const GET = createSharedEventsHandler(
  productionEventHandlerDependencies,
);
export { EVENTS_OPTIONS as OPTIONS };
