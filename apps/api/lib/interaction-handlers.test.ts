import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGetNextActionsHandler,
  createGetNoteHandler,
  createPatchNextActionHandler,
  createPostNextActionHandler,
  createPostNoteHandler,
  type InteractionHandlerDependencies,
} from "./interaction-handlers";

const scanId = "00000000-0000-4013-8000-000000000801";
const actionId = "00000000-0000-4013-8000-000000000901";

function makeRequest(
  url: string,
  init?: RequestInit,
  authenticated = true,
): Request {
  return new Request(url, {
    ...init,
    headers: {
      ...(authenticated ? { Authorization: "Bearer valid-token" } : {}),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function makeContext(id = scanId) {
  return { params: Promise.resolve({ scanId: id }) };
}

describe("createPostNoteHandler", () => {
  const repository = {
    createNextAction: vi.fn(),
    upsertNote: vi.fn(),
  };
  let dependencies: InteractionHandlerDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4013-8000-000000000001",
      }),
    };
  });

  it("returns 401 when Authorization header is missing", async () => {
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, {}, false),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when authenticate returns null", async () => {
    vi.mocked(dependencies.authenticate).mockResolvedValue(null);
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, {
        method: "POST",
        body: JSON.stringify({ note_text: "hello" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid scanId", async () => {
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/not-a-uuid/note`, {
        method: "POST",
        body: JSON.stringify({ note_text: "hello" }),
      }),
      makeContext("not-a-uuid"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing note_text", async () => {
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      makeContext(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_note");
  });

  it("returns 400 for empty note_text", async () => {
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, {
        method: "POST",
        body: JSON.stringify({ note_text: "" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const handler = createPostNoteHandler(dependencies);
    const req = new Request(`http://api/v1/scans/${scanId}/note`, {
      method: "POST",
      body: "not json",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
    });
    const res = await handler(req, makeContext());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_json");
  });

  it("returns 404 when repository returns null (scan not owned)", async () => {
    repository.upsertNote.mockResolvedValue(null);
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, {
        method: "POST",
        body: JSON.stringify({ note_text: "hello" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with note on success", async () => {
    repository.upsertNote.mockResolvedValue({
      id: "00000000-0000-4013-8000-000000000099",
    });
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, {
        method: "POST",
        body: JSON.stringify({ note_text: "メモです" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { note_text: string; scan_id: string };
    expect(body.note_text).toBe("メモです");
    expect(body.scan_id).toBe(scanId);
  });

  it("calls upsertNote with correct scanId and text", async () => {
    repository.upsertNote.mockResolvedValue({
      id: "00000000-0000-4013-8000-000000000099",
    });
    const handler = createPostNoteHandler(dependencies);
    await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, {
        method: "POST",
        body: JSON.stringify({ note_text: "テスト" }),
      }),
      makeContext(),
    );
    expect(repository.upsertNote).toHaveBeenCalledWith(scanId, "テスト");
  });

  it("returns 500 when upsertNote throws", async () => {
    repository.upsertNote.mockRejectedValue(new Error("db error"));
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, {
        method: "POST",
        body: JSON.stringify({ note_text: "メモ" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(500);
  });
});

describe("createGetNoteHandler", () => {
  const repository = {
    createNextAction: vi.fn(),
    getNote: vi.fn(),
    listNextActions: vi.fn(),
    updateNextActionStatus: vi.fn(),
    upsertNote: vi.fn(),
  };
  let dependencies: InteractionHandlerDependencies;

  function get(id = scanId, authenticated = true) {
    return createGetNoteHandler(dependencies)(
      makeRequest(`http://api/v1/scans/${id}/note`, {}, authenticated),
      makeContext(id),
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4013-8000-000000000001",
      }),
    };
  });

  it("returns the saved note so the client can edit rather than overwrite it", async () => {
    repository.getNote.mockResolvedValue({ note_text: "事例を送る約束" });

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      note_text: "事例を送る約束",
      scan_id: scanId,
    });
    expect(repository.getNote).toHaveBeenCalledWith(scanId);
  });

  it("returns a null note for an owned scan without one", async () => {
    repository.getNote.mockResolvedValue({ note_text: null });

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      note_text: null,
      scan_id: scanId,
    });
  });

  it("returns 404 for a scan the caller does not own", async () => {
    repository.getNote.mockResolvedValue(null);

    expect((await get()).status).toBe(404);
  });

  it("returns 404 for a scan id that is not a UUID", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
    expect(repository.getNote).not.toHaveBeenCalled();
  });

  it("returns 401 without an Authorization header", async () => {
    expect((await get(scanId, false)).status).toBe(401);
    expect(repository.getNote).not.toHaveBeenCalled();
  });

  it("returns 500 when the read fails", async () => {
    repository.getNote.mockRejectedValue(new Error("db error"));

    expect((await get()).status).toBe(500);
  });
});

describe("createPostNextActionHandler", () => {
  const repository = {
    createNextAction: vi.fn(),
    upsertNote: vi.fn(),
  };
  let dependencies: InteractionHandlerDependencies;

  const validAction = {
    action_text: "来週フォローアップする",
    source: "ai" as const,
    status: "accepted" as const,
    timing_text: "1週間以内",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4013-8000-000000000001",
      }),
    };
  });

  it("returns 401 when Authorization header is missing", async () => {
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {}, false),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid scanId", async () => {
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/bad-id/next-action`, {
        method: "POST",
        body: JSON.stringify(validAction),
      }),
      makeContext("bad-id"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for empty action_text", async () => {
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify({ ...validAction, action_text: "" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_next_action");
  });

  it("returns 400 for invalid source", async () => {
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify({ ...validAction, source: "robot" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid status", async () => {
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify({ ...validAction, status: "pending" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when repository returns null (scan not owned)", async () => {
    repository.createNextAction.mockResolvedValue(null);
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify(validAction),
      }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 201 with action on success", async () => {
    repository.createNextAction.mockResolvedValue({
      id: "00000000-0000-4013-8000-000000000099",
    });
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify(validAction),
      }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      action_text: string;
      scan_id: string;
      source: string;
      status: string;
      timing_text: string;
    };
    expect(body.action_text).toBe(validAction.action_text);
    expect(body.scan_id).toBe(scanId);
    expect(body.source).toBe("ai");
    expect(body.status).toBe("accepted");
    expect(body.timing_text).toBe("1週間以内");
  });

  it("returns 201 with null timing_text when omitted", async () => {
    repository.createNextAction.mockResolvedValue({
      id: "00000000-0000-4013-8000-000000000099",
    });
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify({
          action_text: "アクション",
          source: "ai",
          status: "dismissed",
        }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { timing_text: null };
    expect(body.timing_text).toBeNull();
  });

  it("calls createNextAction with correct arguments", async () => {
    repository.createNextAction.mockResolvedValue({
      id: "00000000-0000-4013-8000-000000000099",
    });
    const handler = createPostNextActionHandler(dependencies);
    await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify(validAction),
      }),
      makeContext(),
    );
    expect(repository.createNextAction).toHaveBeenCalledWith(
      scanId,
      validAction.action_text,
      validAction.timing_text,
      "ai",
      "accepted",
    );
  });

  it("returns 500 when createNextAction throws", async () => {
    repository.createNextAction.mockRejectedValue(new Error("db error"));
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify(validAction),
      }),
      makeContext(),
    );
    expect(res.status).toBe(500);
  });
});

describe("createGetNextActionsHandler", () => {
  const repository = {
    createNextAction: vi.fn(),
    listNextActions: vi.fn(),
    updateNextActionStatus: vi.fn(),
    upsertNote: vi.fn(),
  };
  let dependencies: InteractionHandlerDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4013-8000-000000000001",
      }),
    };
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await createGetNextActionsHandler(dependencies)(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {}, false),
      makeContext(),
    );
    expect(res.status).toBe(401);
    expect(repository.listNextActions).not.toHaveBeenCalled();
  });

  it("returns the actions recorded for the scan", async () => {
    repository.listNextActions.mockResolvedValue([
      {
        action_text: "事例資料を共有する",
        id: actionId,
        scan_id: scanId,
        source: "ai",
        status: "accepted",
        timing_text: "3日以内",
      },
    ]);

    const res = await createGetNextActionsHandler(dependencies)(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`),
      makeContext(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scan_id).toBe(scanId);
    expect(body.items).toHaveLength(1);
  });

  it("returns 500 when the read fails", async () => {
    repository.listNextActions.mockRejectedValue(new Error("db error"));
    const res = await createGetNextActionsHandler(dependencies)(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`),
      makeContext(),
    );
    expect(res.status).toBe(500);
  });
});

describe("createPatchNextActionHandler", () => {
  const repository = {
    createNextAction: vi.fn(),
    listNextActions: vi.fn(),
    updateNextActionStatus: vi.fn(),
    upsertNote: vi.fn(),
  };
  let dependencies: InteractionHandlerDependencies;

  function patch(body: unknown, authenticated = true) {
    return createPatchNextActionHandler(dependencies)(
      makeRequest(
        `http://api/v1/scans/${scanId}/next-action`,
        { body: JSON.stringify(body), method: "PATCH" },
        authenticated,
      ),
      makeContext(),
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4013-8000-000000000001",
      }),
    };
  });

  it("records a completed outcome", async () => {
    repository.updateNextActionStatus.mockResolvedValue({ id: actionId });

    const res = await patch({ action_id: actionId, status: "completed" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: actionId,
      scan_id: scanId,
      status: "completed",
    });
    expect(repository.updateNextActionStatus).toHaveBeenCalledWith(
      actionId,
      "completed",
    );
  });

  it("rejects a status the outcome contract does not allow", async () => {
    const res = await patch({ action_id: actionId, status: "suggested" });

    expect(res.status).toBe(400);
    expect(repository.updateNextActionStatus).not.toHaveBeenCalled();
  });

  it("rejects an action id that is not a UUID", async () => {
    const res = await patch({ action_id: "nope", status: "completed" });

    expect(res.status).toBe(400);
    expect(repository.updateNextActionStatus).not.toHaveBeenCalled();
  });

  it("returns 404 when the action belongs to someone else or is unknown", async () => {
    repository.updateNextActionStatus.mockResolvedValue(null);

    const res = await patch({ action_id: actionId, status: "completed" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed body", async () => {
    const res = await createPatchNextActionHandler(dependencies)(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        body: "{",
        method: "PATCH",
      }),
      makeContext(),
    );

    expect(res.status).toBe(400);
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await patch(
      { action_id: actionId, status: "completed" },
      false,
    );

    expect(res.status).toBe(401);
    expect(repository.updateNextActionStatus).not.toHaveBeenCalled();
  });

  it("returns 500 when the update fails", async () => {
    repository.updateNextActionStatus.mockRejectedValue(new Error("db error"));

    const res = await patch({ action_id: actionId, status: "completed" });

    expect(res.status).toBe(500);
  });
});
