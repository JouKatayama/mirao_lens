import {
  createHubSpotCallbackHandler,
  productionHubSpotDependencies,
} from "../../../../lib/hubspot-handlers";

export const runtime = "nodejs";
export const GET = createHubSpotCallbackHandler(productionHubSpotDependencies);
