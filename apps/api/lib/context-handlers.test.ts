import { PersonalContextStructuringError } from "@miraio/ai";
import {
  personalContextOnboardingInputSchema,
  type PersonalContextItem,
  type PersonalContextResponse,
} from "@miraio/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDeleteContextItemHandler,
  createGetContextHandler,
  createPatchContextItemHandler,
  createPostOnboardingHandler,
  type ContextHandlerDependencies,
} from "./context-handlers";

const itemId = "00000000-0000-4000-8000-000000000333";
const item: PersonalContextItem = {
  id: itemId,
  type: "offer",
  text: "Structured feedback on early concepts",
  tags: ["feedback"],
  source_type: "ai_suggested",
  user_approved: false,
  created_at: "2026-08-17T00:00:00.000Z",
  updated_at: "2026-08-17T00:00:00.000Z",
};
const approved: PersonalContextResponse = {
  profile: {
    current_company: "Example Company",
    current_role: "Product Lead",
  },
  items: [{ ...item, user_approved: true }],
};
const validBody = personalContextOnboardingInputSchema.parse({
  request_id: "00000000-0000-4000-8000-000000000303",
  profile: {
    current_company: "Example Company",
    current_role: "Product Lead",
  },
  answers: { offer: "Structured feedback on early concepts" },
  locale: "ja",
});

function request(
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

describe("Personal Context HTTP handlers", () => {
  const repository = {
    deleteItem: vi.fn(),
    getApproved: vi.fn(),
    persistOnboarding: vi.fn(),
    updateItem: vi.fn(),
  };
  const structurer = { structure: vi.fn() };
  let dependencies: ContextHandlerDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({
        repository,
        userId: "00000000-0000-4000-8000-000000000004",
      }),
      createStructurer: () => structurer,
    };
  });

  it("returns 401 before any data access when authentication is missing", async () => {
    const response = await createGetContextHandler(dependencies)(
      request("http://localhost/v1/context", undefined, false),
    );

    expect(response.status).toBe(401);
    expect(dependencies.authenticate).not.toHaveBeenCalled();
    expect(repository.getApproved).not.toHaveBeenCalled();
  });

  it("returns only the approved-context repository result", async () => {
    repository.getApproved.mockResolvedValue(approved);

    const response = await createGetContextHandler(dependencies)(
      request("http://localhost/v1/context"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(approved);
  });

  it("structures and persists valid onboarding input as unapproved", async () => {
    structurer.structure.mockResolvedValue({
      suggestions: [{ type: "offer", text: item.text, tags: item.tags }],
    });
    repository.persistOnboarding.mockResolvedValue([item]);

    const response = await createPostOnboardingHandler(dependencies)(
      request("http://localhost/v1/context/onboarding", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      suggestions: [{ user_approved: false }],
    });
    expect(repository.persistOnboarding).toHaveBeenCalledTimes(1);
  });

  it("does not call AI or persistence for invalid input", async () => {
    const response = await createPostOnboardingHandler(dependencies)(
      request("http://localhost/v1/context/onboarding", {
        method: "POST",
        body: JSON.stringify({ profile: {}, answers: {} }),
      }),
    );

    expect(response.status).toBe(400);
    expect(structurer.structure).not.toHaveBeenCalled();
    expect(repository.persistOnboarding).not.toHaveBeenCalled();
  });

  it("maps provider rate limits to a retryable 429", async () => {
    structurer.structure.mockRejectedValue(
      new PersonalContextStructuringError("rate_limited"),
    );

    const response = await createPostOnboardingHandler(dependencies)(
      request("http://localhost/v1/context/onboarding", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(429);
    expect(repository.persistOnboarding).not.toHaveBeenCalled();
  });

  it("edits and explicitly approves an owned item", async () => {
    repository.updateItem.mockResolvedValue({ ...item, user_approved: true });

    const response = await createPatchContextItemHandler(dependencies)(
      request(`http://localhost/v1/context/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ text: item.text, user_approved: true }),
      }),
      { params: Promise.resolve({ itemId }) },
    );

    expect(response.status).toBe(200);
    expect(repository.updateItem).toHaveBeenCalledWith(itemId, {
      text: item.text,
      user_approved: true,
    });
  });

  it("returns 404 without disclosing a missing or non-owned item", async () => {
    repository.updateItem.mockResolvedValue(null);

    const response = await createPatchContextItemHandler(dependencies)(
      request(`http://localhost/v1/context/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ user_approved: true }),
      }),
      { params: Promise.resolve({ itemId }) },
    );

    expect(response.status).toBe(404);
  });

  it("deletes an owned item with no response body", async () => {
    repository.deleteItem.mockResolvedValue(true);

    const response = await createDeleteContextItemHandler(dependencies)(
      request(`http://localhost/v1/context/${itemId}`, { method: "DELETE" }),
      { params: Promise.resolve({ itemId }) },
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});
