import {
  createHubSpotExportHandler,
  HUBSPOT_OPTIONS,
  productionHubSpotDependencies,
} from "../../../../lib/hubspot-handlers";

export const runtime = "nodejs";
export const POST = createHubSpotExportHandler(productionHubSpotDependencies);
export { HUBSPOT_OPTIONS as OPTIONS };
