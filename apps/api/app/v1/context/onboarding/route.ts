import {
  createPostOnboardingHandler,
  OPTIONS,
  productionContextDependencies,
} from "../../../../lib/context-handlers";

export const POST = createPostOnboardingHandler(productionContextDependencies);
export { OPTIONS };
