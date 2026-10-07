import {
  createGetEventsHandler,
  createPostEventHandler,
  EVENTS_OPTIONS,
  productionEventHandlerDependencies,
} from "../../../lib/event-handlers";

export const runtime = "nodejs";
export const GET = createGetEventsHandler(productionEventHandlerDependencies);
export const POST = createPostEventHandler(productionEventHandlerDependencies);
export { EVENTS_OPTIONS as OPTIONS };
