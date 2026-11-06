import { FollowUpStageError } from "@miraio/ai";
import {
  followUpInputSchema,
  type FollowUpRecommendation,
} from "@miraio/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGetFollowUpHandler,
  createPatchFollowUpHandler,
  createPostFollowUpHandler,
  type FollowUpHandlerDependencies,
} from "./follow-up-handlers";

const scanId = "00000000-0000-4031-8000-000000000901";

const input = followUpInputSchema.parse({
  card: { company: "Example Co", name: "Synthetic Contact", title: null },
  connections: [],
  meeting_goal: "partnership",
  mutual_value: { bridge: "AI bridge", next_action: "AI next" },
  next_actions: [],
  note: "Asked for the inspection case study.",
  personal_context: { current_company: null, current_role: null, items: [] },
  previous_encounter_count: 0,
});

const recommendation: FollowUpRecommendation = {
  confidence: 0.8,
  decided_at: null,
  decision: "follow_up",
  draft: { body: "本文", subject: "件名" },
  edited: false,
  generated_at: "2026-11-07T00:00:00.000Z",
  id: "00000000-0000-4031-8000-000000000a01",
  reasons: [{ claim_type: "fact", source: "note", text: "資料を求められた" }],
  recipient_email: null,
  scan_id: scanId,
  status: "suggested",
  timing: "3日以内",
  uncertainty: null,
};

function request(method: string, body?: unknown, authenticated = true) {
  return new Request(`http://api/v1/scans/${scanId}/follow-up`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: authenticated ? { Authorization: "Bearer valid-token" } : {},
    method,
  });
}

const context = (id = scanId) => ({ params: Promise.resolve({ scanId: id }) });

describe("follow-up handlers", () => {
  const repository = {
    decide: vi.fn(),
    getFollowUpInput: vi.fn(),
    getRecommendation: vi.fn(),
    saveRecommendation: vi.fn(),
  };
  const judge = { judge: vi.fn() };
  const drafter = { draft: vi.fn() };
  let dependencies: FollowUpHandlerDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({ repository, userId: "user-1" }),
      createStages: () => ({
        drafter,
        judge,
        modelAlias: "test-model",
        provider: "test",
      }),
      nowMilliseconds: () => 0,
    };
  });

  it("requires authentication", async () => {
    const res = await createGetFollowUpHandler(dependencies)(
      request("GET", undefined, false),
      context(),
    );
    expect(res.status).toBe(401);
  });

  it("returns null before anything was judged", async () => {
    repository.getRecommendation.mockResolvedValue(null);
    const res = await createGetFollowUpHandler(dependencies)(
      request("GET"),
      context(),
    );
    await expect(res.json()).resolves.toEqual({
      recommendation: null,
      scan_id: scanId,
    });
  });

  it("drafts after a follow_up decision without passing Mutual Value", async () => {
    repository.getFollowUpInput.mockResolvedValue(input);
    judge.judge.mockResolvedValue({
      confidence: 0.8,
      decision: "follow_up",
      reasons: recommendation.reasons,
      timing: "3日以内",
      uncertainty: null,
    });
    drafter.draft.mockResolvedValue({ body: "本文", subject: "件名" });
    repository.saveRecommendation.mockResolvedValue(recommendation);

    const res = await createPostFollowUpHandler(dependencies)(
      request("POST"),
      context(),
    );

    expect(res.status).toBe(201);
    const draftInput = drafter.draft.mock.calls[0]?.[0];
    expect(JSON.stringify(draftInput)).not.toContain("AI bridge");
    expect(repository.saveRecommendation).toHaveBeenCalledWith(
      scanId,
      expect.objectContaining({ decision: "follow_up" }),
      { body: "本文", subject: "件名" },
      expect.objectContaining({ draft_status: "generated" }),
    );
  });

  it("does not draft for hold", async () => {
    repository.getFollowUpInput.mockResolvedValue(input);
    judge.judge.mockResolvedValue({
      confidence: 0.4,
      decision: "hold",
      reasons: [{ claim_type: "fact", source: "note", text: "x" }],
      timing: null,
      uncertainty: "材料が少ない",
    });
    repository.saveRecommendation.mockResolvedValue({
      ...recommendation,
      decision: "hold",
      draft: null,
    });

    await createPostFollowUpHandler(dependencies)(request("POST"), context());

    expect(drafter.draft).not.toHaveBeenCalled();
  });

  it("keeps the judgement when drafting fails", async () => {
    repository.getFollowUpInput.mockResolvedValue(input);
    judge.judge.mockResolvedValue({
      confidence: 0.8,
      decision: "follow_up",
      reasons: recommendation.reasons,
      timing: null,
      uncertainty: null,
    });
    drafter.draft.mockRejectedValue(new FollowUpStageError("timeout"));
    repository.saveRecommendation.mockResolvedValue({
      ...recommendation,
      draft: null,
    });

    const res = await createPostFollowUpHandler(dependencies)(
      request("POST"),
      context(),
    );

    expect(res.status).toBe(201);
    expect(repository.saveRecommendation).toHaveBeenCalledWith(
      scanId,
      expect.anything(),
      null,
      expect.objectContaining({ draft_status: "failed" }),
    );
  });

  it("returns 503 and stores nothing when judging fails", async () => {
    repository.getFollowUpInput.mockResolvedValue(input);
    judge.judge.mockRejectedValue(new FollowUpStageError("rate_limited"));

    const res = await createPostFollowUpHandler(dependencies)(
      request("POST"),
      context(),
    );

    expect(res.status).toBe(503);
    expect(repository.saveRecommendation).not.toHaveBeenCalled();
  });

  it("records an approval with the edited draft", async () => {
    repository.decide.mockResolvedValue({
      ...recommendation,
      status: "approved",
    });
    const body = {
      draft: { body: "編集した本文", subject: "件名" },
      status: "approved",
    };

    const res = await createPatchFollowUpHandler(dependencies)(
      request("PATCH", body),
      context(),
    );

    expect(res.status).toBe(200);
    expect(repository.decide).toHaveBeenCalledWith(scanId, body);
  });

  it("rejects a send instruction", async () => {
    const res = await createPatchFollowUpHandler(dependencies)(
      request("PATCH", { status: "sent" }),
      context(),
    );

    expect(res.status).toBe(400);
    expect(repository.decide).not.toHaveBeenCalled();
  });
});
