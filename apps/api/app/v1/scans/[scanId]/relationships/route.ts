import {
  createDeleteConnectionHandler,
  createGetRelationshipsHandler,
  createPostConnectionHandler,
  productionRelationshipHandlerDependencies,
  RELATIONSHIPS_OPTIONS,
} from "../../../../../lib/relationship-handlers";

export const runtime = "nodejs";

export const GET = createGetRelationshipsHandler(
  productionRelationshipHandlerDependencies,
);
export const POST = createPostConnectionHandler(
  productionRelationshipHandlerDependencies,
);
export const DELETE = createDeleteConnectionHandler(
  productionRelationshipHandlerDependencies,
);
export { RELATIONSHIPS_OPTIONS as OPTIONS };
