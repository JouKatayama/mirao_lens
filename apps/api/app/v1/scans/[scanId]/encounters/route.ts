import {
  createGetEncountersHandler,
  ENCOUNTERS_OPTIONS,
  productionEncounterHandlerDependencies,
} from "../../../../../lib/encounter-handlers";

export const runtime = "nodejs";

export const GET = createGetEncountersHandler(
  productionEncounterHandlerDependencies,
);
export { ENCOUNTERS_OPTIONS as OPTIONS };
