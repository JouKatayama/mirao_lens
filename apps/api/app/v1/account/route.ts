import {
  ACCOUNT_OPTIONS,
  createDeleteAccountHandler,
  productionAccountHandlerDependencies,
} from "../../../lib/account-handlers";

export const runtime = "nodejs";

export const DELETE = createDeleteAccountHandler(
  productionAccountHandlerDependencies,
);
export { ACCOUNT_OPTIONS as OPTIONS };
