import {
  createPostNextActionHandler,
  INTERACTION_OPTIONS,
  productionInteractionHandlerDependencies,
} from "../../../../../lib/interaction-handlers";

export const runtime = "nodejs";

export const POST = createPostNextActionHandler(
  productionInteractionHandlerDependencies,
);
export { INTERACTION_OPTIONS as OPTIONS };
