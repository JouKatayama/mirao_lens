import {
  createGetRemindersHandler,
  INTERACTION_OPTIONS,
  productionInteractionHandlerDependencies,
} from "../../../lib/interaction-handlers";

export const GET = createGetRemindersHandler(
  productionInteractionHandlerDependencies,
);
export const OPTIONS = INTERACTION_OPTIONS;
