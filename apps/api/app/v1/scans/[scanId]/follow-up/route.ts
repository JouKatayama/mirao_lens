import {
  createGetFollowUpHandler,
  createPatchFollowUpHandler,
  createPostFollowUpHandler,
  FOLLOW_UP_OPTIONS,
  productionFollowUpHandlerDependencies,
} from "../../../../../lib/follow-up-handlers";

export const runtime = "nodejs";
// Judge and draft run in sequence on this request, each bounded at 14s.
export const maxDuration = 60;

export const GET = createGetFollowUpHandler(
  productionFollowUpHandlerDependencies,
);
export const POST = createPostFollowUpHandler(
  productionFollowUpHandlerDependencies,
);
export const PATCH = createPatchFollowUpHandler(
  productionFollowUpHandlerDependencies,
);
export { FOLLOW_UP_OPTIONS as OPTIONS };
