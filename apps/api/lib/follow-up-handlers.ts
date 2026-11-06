import {
  FollowUpStageError,
  OpenAIFollowUpDrafter,
  OpenAIFollowUpJudge,
  type FollowUpDrafter,
  type FollowUpJudge,
} from "@miraio/ai";
import {
  authenticateFollowUpSession,
  FollowUpRepositoryError,
  type FollowUpModelMetadata,
} from "@miraio/db";
import {
  followUpDecisionRequestSchema,
  toFollowUpDraftInput,
  type FollowUpDecisionRequest,
  type FollowUpDraft,
  type FollowUpInput,
  type FollowUpJudgement,
  type FollowUpRecommendation,
} from "@miraio/domain";

import {
  authenticateRoute,
  createCorsHeaders,
  createResponder,
  readJsonBody,
  readScanId,
  type ScanRouteContext,
} from "./route-http";
import {
  readOpenAIFollowUpConfig,
  readServerSupabaseConfig,
} from "./server-config";

/**
 * Pilot extension 5 (spec §2.4, ADR-0010). GET reads the recommendation, POST
 * judges (and, for a follow-up, drafts), PATCH records the user's decision.
 * There is deliberately no route that sends: approval is handed to the device.
 */

const respond = createResponder(createCorsHeaders("GET, POST, PATCH"));

type FollowUpRepositoryPort = Readonly<{
  decide(
    scanId: string,
    request: FollowUpDecisionRequest,
  ): Promise<FollowUpRecommendation | null>;
  getFollowUpInput(scanId: string): Promise<FollowUpInput | null>;
  getRecommendation(scanId: string): Promise<FollowUpRecommendation | null>;
  saveRecommendation(
    scanId: string,
    judgement: FollowUpJudgement,
    draft: FollowUpDraft | null,
    metadata: FollowUpModelMetadata,
  ): Promise<FollowUpRecommendation>;
}>;

type FollowUpSession = Readonly<{
  repository: FollowUpRepositoryPort;
  userId: string;
}>;

export type FollowUpHandlerDependencies = Readonly<{
  authenticate(accessToken: string): Promise<FollowUpSession | null>;
  /** Throws FollowUpStageError("configuration") when no model is set. */
  createStages(): Readonly<{
    drafter: FollowUpDrafter;
    judge: FollowUpJudge;
    modelAlias: string;
    provider: string;
  }>;
  nowMilliseconds(): number;
}>;

type Handler = (
  request: Request,
  context: ScanRouteContext,
) => Promise<Response>;

function persistenceFailure(error: unknown): Response {
  return error instanceof FollowUpRepositoryError
    ? respond.internal("follow_up_persistence_failed")
    : respond.internal("follow_up_request_failed");
}

export function createGetFollowUpHandler(
  dependencies: FollowUpHandlerDependencies,
): Handler {
  return async (request, context) => {
    const session = await authenticateRoute(
      request,
      dependencies.authenticate,
      respond,
    );
    if (session instanceof Response) return session;

    const scanId = await readScanId(context);
    if (!scanId) return respond.error(404, "not_found", "Scan not found.");

    try {
      const recommendation = await session.repository.getRecommendation(scanId);
      return respond.json({ recommendation, scan_id: scanId });
    } catch (error) {
      return persistenceFailure(error);
    }
  };
}

export function createPostFollowUpHandler(
  dependencies: FollowUpHandlerDependencies,
): Handler {
  return async (request, context) => {
    const session = await authenticateRoute(
      request,
      dependencies.authenticate,
      respond,
    );
    if (session instanceof Response) return session;

    const scanId = await readScanId(context);
    if (!scanId) return respond.error(404, "not_found", "Scan not found.");

    let input: FollowUpInput | null;
    try {
      input = await session.repository.getFollowUpInput(scanId);
    } catch (error) {
      return persistenceFailure(error);
    }

    if (!input) {
      return respond.error(404, "not_found", "Scan not found.");
    }

    let stages: ReturnType<FollowUpHandlerDependencies["createStages"]>;
    let judgement: FollowUpJudgement;
    const startedAt = dependencies.nowMilliseconds();

    try {
      stages = dependencies.createStages();
      judgement = await stages.judge.judge(input);
    } catch (error) {
      // The encounter simply shows no recommendation (spec §2.4); the brief
      // and the rest of the record are untouched.
      const code =
        error instanceof FollowUpStageError ? error.code : "unavailable";
      return respond.error(
        503,
        "follow_up_unavailable",
        "The follow-up recommendation could not be prepared.",
        [{ message: code, path: "stage" }],
      );
    }

    // A draft is written only after a follow_up decision. If drafting fails,
    // the judgement still stands and the user can write the message themself.
    let draft: FollowUpDraft | null = null;
    let draftStatus: FollowUpModelMetadata["draft_status"] = "not_requested";

    if (judgement.decision === "follow_up") {
      try {
        draft = await stages.drafter.draft(
          toFollowUpDraftInput(input, judgement),
        );
        draftStatus = "generated";
      } catch {
        draftStatus = "failed";
      }
    }

    try {
      const recommendation = await session.repository.saveRecommendation(
        scanId,
        judgement,
        draft,
        {
          draft_status: draftStatus,
          latency_ms: Math.max(
            0,
            Math.round(dependencies.nowMilliseconds() - startedAt),
          ),
          model_alias: stages.modelAlias,
          provider: stages.provider,
        },
      );
      return respond.json({ recommendation, scan_id: scanId }, 201);
    } catch (error) {
      return persistenceFailure(error);
    }
  };
}

export function createPatchFollowUpHandler(
  dependencies: FollowUpHandlerDependencies,
): Handler {
  return async (request, context) => {
    const session = await authenticateRoute(
      request,
      dependencies.authenticate,
      respond,
    );
    if (session instanceof Response) return session;

    const scanId = await readScanId(context);
    if (!scanId) return respond.error(404, "not_found", "Scan not found.");

    const body = await readJsonBody(request);
    if (!body.ok) {
      return respond.error(
        400,
        "invalid_json",
        "A valid JSON body is required.",
      );
    }

    const parsed = followUpDecisionRequestSchema.safeParse(body.body);
    if (!parsed.success) {
      return respond.error(
        400,
        "invalid_decision",
        "Check the decision fields.",
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      );
    }

    try {
      const recommendation = await session.repository.decide(
        scanId,
        parsed.data,
      );
      return recommendation
        ? respond.json({ recommendation, scan_id: scanId })
        : respond.error(404, "not_found", "No recommendation to decide on.");
    } catch (error) {
      return persistenceFailure(error);
    }
  };
}

export function FOLLOW_UP_OPTIONS(): Response {
  return respond.options();
}

export const productionFollowUpHandlerDependencies: FollowUpHandlerDependencies =
  {
    async authenticate(accessToken) {
      return authenticateFollowUpSession(
        readServerSupabaseConfig(process.env),
        accessToken,
      );
    },
    createStages() {
      let configuration: ReturnType<typeof readOpenAIFollowUpConfig>;
      try {
        configuration = readOpenAIFollowUpConfig(process.env);
      } catch {
        throw new FollowUpStageError("configuration");
      }

      return {
        drafter: new OpenAIFollowUpDrafter(configuration),
        judge: new OpenAIFollowUpJudge(configuration),
        modelAlias: configuration.model,
        provider: "openai",
      };
    },
    nowMilliseconds: () => performance.now(),
  };
