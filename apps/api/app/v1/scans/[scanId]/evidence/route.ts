import {
  createGetEvidenceHandler,
  EVIDENCE_OPTIONS,
  productionEvidenceHandlerDependencies,
} from "../../../../../lib/evidence-handlers";

export const runtime = "nodejs";

export const GET = createGetEvidenceHandler(
  productionEvidenceHandlerDependencies,
);
export { EVIDENCE_OPTIONS as OPTIONS };
