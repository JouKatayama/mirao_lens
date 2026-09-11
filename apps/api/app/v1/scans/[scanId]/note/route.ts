import {
  createGetNoteHandler,
  createPostNoteHandler,
  INTERACTION_OPTIONS,
  productionInteractionHandlerDependencies,
} from "../../../../../lib/interaction-handlers";

export const runtime = "nodejs";

export const GET = createGetNoteHandler(
  productionInteractionHandlerDependencies,
);
export const POST = createPostNoteHandler(
  productionInteractionHandlerDependencies,
);
export { INTERACTION_OPTIONS as OPTIONS };
