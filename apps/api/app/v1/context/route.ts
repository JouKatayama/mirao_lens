import {
  createGetContextHandler,
  OPTIONS,
  productionContextDependencies,
} from "../../../lib/context-handlers";

export const GET = createGetContextHandler(productionContextDependencies);
export { OPTIONS };
