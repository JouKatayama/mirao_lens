import {
  createHubSpotDisconnectHandler,
  createHubSpotStatusHandler,
  HUBSPOT_OPTIONS,
  productionHubSpotDependencies,
} from "../../../lib/hubspot-handlers";

export const runtime = "nodejs";
export const GET = createHubSpotStatusHandler(productionHubSpotDependencies);
export const DELETE = createHubSpotDisconnectHandler(
  productionHubSpotDependencies,
);
export { HUBSPOT_OPTIONS as OPTIONS };
