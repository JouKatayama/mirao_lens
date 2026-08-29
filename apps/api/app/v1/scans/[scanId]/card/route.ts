import {
  CARD_INTELLIGENCE_OPTIONS,
  createPatchBusinessCardHandler,
  productionCardIntelligenceHandlerDependencies,
} from "../../../../../lib/card-intelligence-handlers";

export const runtime = "nodejs";

export const PATCH = createPatchBusinessCardHandler(
  productionCardIntelligenceHandlerDependencies,
);
export { CARD_INTELLIGENCE_OPTIONS as OPTIONS };
