import {
  CARD_INTELLIGENCE_OPTIONS,
  createGetCardIntelligenceStatusHandler,
  productionCardIntelligenceHandlerDependencies,
} from "../../../../../lib/card-intelligence-handlers";

export const runtime = "nodejs";

export const GET = createGetCardIntelligenceStatusHandler(
  productionCardIntelligenceHandlerDependencies,
);
export { CARD_INTELLIGENCE_OPTIONS as OPTIONS };
