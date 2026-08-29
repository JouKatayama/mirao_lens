import {
  createPostNoteHandler,
  INTERACTION_OPTIONS,
  productionInteractionHandlerDependencies,
} from "../../../../../lib/interaction-handlers";

export const runtime = "nodejs";

export const POST = createPostNoteHandler(
  productionInteractionHandlerDependencies,
);
export { INTERACTION_OPTIONS as OPTIONS };
