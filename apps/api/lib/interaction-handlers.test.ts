import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPostNextActionHandler,
  createPostNoteHandler,
  type InteractionHandlerDependencies,
} from "./interaction-handlers";

const scanId = "00000000-0000-4013-8000-000000000801";

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
      makeRequest(`http://api/v1/scans/${scanId}/note`, { method: "POST", body: JSON.stringify({ note_text: "hello" }) }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid scanId", async () => {
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/not-a-uuid/note`, { method: "POST", body: JSON.stringify({ note_text: "hello" }) }),
      makeContext("not-a-uuid"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing note_text", async () => {
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, { method: "POST", body: JSON.stringify({}) }),
      makeContext(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("invalid_note");
  });

  it("returns 400 for empty note_text", async () => {
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, { method: "POST", body: JSON.stringify({ note_text: "" }) }),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const handler = createPostNoteHandler(dependencies);
    const req = new Request(`http://api/v1/scans/${scanId}/note`, {
      method: "POST",
      body: "not json",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    });
    const res = await handler(req, makeContext());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("invalid_json");
  });

  it("returns 404 when repository returns null (scan not owned)", async () => {
    repository.upsertNote.mockResolvedValue(null);
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, { method: "POST", body: JSON.stringify({ note_text: "hello" }) }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with note on success", async () => {
    repository.upsertNote.mockResolvedValue({ id: "00000000-0000-4013-8000-000000000099" });
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, { method: "POST", body: JSON.stringify({ note_text: "メモです" }) }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { note_text: string; scan_id: string };
    expect(body.note_text).toBe("メモです");
    expect(body.scan_id).toBe(scanId);
  });

  it("calls upsertNote with correct scanId and text", async () => {
    repository.upsertNote.mockResolvedValue({ id: "00000000-0000-4013-8000-000000000099" });
    const handler = createPostNoteHandler(dependencies);
    await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, { method: "POST", body: JSON.stringify({ note_text: "テスト" }) }),
      makeContext(),
    );
    expect(repository.upsertNote).toHaveBeenCalledWith(scanId, "テスト");
  });

  it("returns 500 when upsertNote throws", async () => {
    repository.upsertNote.mockRejectedValue(new Error("db error"));
    const handler = createPostNoteHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/note`, { method: "POST", body: JSON.stringify({ note_text: "メモ" }) }),
      makeContext(),
    );
    expect(res.status).toBe(500);
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
      makeRequest(`http://api/v1/scans/bad-id/next-action`, { method: "POST", body: JSON.stringify(validAction) }),
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
    const body = await res.json() as { error: { code: string } };
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
    repository.createNextAction.mockResolvedValue({ id: "00000000-0000-4013-8000-000000000099" });
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify(validAction),
      }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as {
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
    repository.createNextAction.mockResolvedValue({ id: "00000000-0000-4013-8000-000000000099" });
    const handler = createPostNextActionHandler(dependencies);
    const res = await handler(
      makeRequest(`http://api/v1/scans/${scanId}/next-action`, {
        method: "POST",
        body: JSON.stringify({ action_text: "アクション", source: "ai", status: "dismissed" }),
      }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { timing_text: null };
    expect(body.timing_text).toBeNull();
  });

  it("calls createNextAction with correct arguments", async () => {
    repository.createNextAction.mockResolvedValue({ id: "00000000-0000-4013-8000-000000000099" });
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
