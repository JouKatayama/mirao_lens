import {
  createHubSpotAuthorizeHandler,
  HUBSPOT_OPTIONS,
  productionHubSpotDependencies,
} from "../../../../lib/hubspot-handlers";

export const runtime = "nodejs";
export const POST = createHubSpotAuthorizeHandler(
  productionHubSpotDependencies,
);
export { HUBSPOT_OPTIONS as OPTIONS };
