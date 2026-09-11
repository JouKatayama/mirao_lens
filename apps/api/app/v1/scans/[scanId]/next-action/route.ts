import {
  createGetNextActionsHandler,
  createPatchNextActionHandler,
  createPostNextActionHandler,
  INTERACTION_OPTIONS,
  productionInteractionHandlerDependencies,
} from "../../../../../lib/interaction-handlers";

export const runtime = "nodejs";

export const GET = createGetNextActionsHandler(
  productionInteractionHandlerDependencies,
);
export const PATCH = createPatchNextActionHandler(
  productionInteractionHandlerDependencies,
);
export const POST = createPostNextActionHandler(
  productionInteractionHandlerDependencies,
);
export { INTERACTION_OPTIONS as OPTIONS };
