import {
  createEventMembersHandler,
  EVENTS_OPTIONS,
  productionEventHandlerDependencies,
} from "../../../../../lib/event-handlers";

export const runtime = "nodejs";
const handle = createEventMembersHandler(productionEventHandlerDependencies);
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export { EVENTS_OPTIONS as OPTIONS };
