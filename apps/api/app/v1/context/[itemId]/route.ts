import {
  createDeleteContextItemHandler,
  createPatchContextItemHandler,
  OPTIONS,
  productionContextDependencies,
} from "../../../../lib/context-handlers";

export const DELETE = createDeleteContextItemHandler(
  productionContextDependencies,
);
export const PATCH = createPatchContextItemHandler(
  productionContextDependencies,
);
export { OPTIONS };
