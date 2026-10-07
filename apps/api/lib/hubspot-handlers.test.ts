import { describe, expect, it, vi } from "vitest";

import {
  createHubSpotCallbackHandler,
  createHubSpotDisconnectHandler,
  createHubSpotExportHandler,
  type HubSpotDependencies,
} from "./hubspot-handlers";
import { encryptTokens, HubSpotProvider } from "./hubspot-provider";

const key = Buffer.alloc(32, 3);
const scanId = "11111111-1111-4111-8111-111111111111";

function setup(owned = true) {
  const store = {
    saveState: vi.fn(async () => undefined),
    consumeState: vi.fn(async (): Promise<string | null> => "user-1"),
    saveConnection: vi.fn(async () => undefined),
    getConnection: vi.fn(async () => ({
      hub_id: 7,
      encrypted_tokens: encryptTokens(
        {
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 1800,
          hub_id: 7,
        },
        key,
      ),
      access_expires_at: "2099-01-01T00:00:00Z",
    })),
    deleteConnection: vi.fn(async () => undefined),
    hasOwnedScan: vi.fn(async () => owned),
    saveContactExport: vi.fn(async () => undefined),
    claimNote: vi.fn(async () => true),
    markNoteSent: vi.fn(async () => undefined),
    getExport: vi.fn(async () => ({
      contact_id: "contact-1",
      note_id: "note-1",
      note_status: "sent",
    })),
  };
  const provider = new HubSpotProvider();
  provider.upsertContact = vi.fn(async () => "contact-1");
  provider.createNote = vi.fn(async () => "note-1");
  provider.revoke = vi.fn(async () => undefined);
  provider.exchangeCode = vi.fn(async () => ({
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 1800,
    hub_id: 7,
  }));
  const dependencies: HubSpotDependencies = {
    authenticate: vi.fn(async () => "user-1"),
    store: () => store,
    provider,
    config: () => ({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "https://example.invalid/v1/hubspot/callback",
      tokenKey: key,
    }),
  };
  return { dependencies, store, provider };
}

function request(body: unknown) {
  return new Request("https://example.invalid/v1/hubspot/export", {
    method: "POST",
    headers: {
      Authorization: "Bearer user-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("HubSpot export handler", () => {
  const input = {
    scan_id: scanId,
    contact: { email: "person@example.com" },
    reviewed_note: "Reviewed note",
  };

  it("rejects scans not owned by the authenticated user without a provider call", async () => {
    const { dependencies, provider } = setup(false);
    const response = await createHubSpotExportHandler(dependencies)(
      request(input),
    );
    expect(response.status).toBe(404);
    expect(provider.upsertContact).not.toHaveBeenCalled();
  });

  it("exports a reviewed contact and at most one claimed note", async () => {
    const { dependencies, store, provider } = setup();
    const response = await createHubSpotExportHandler(dependencies)(
      request(input),
    );
    expect(response.status).toBe(200);
    expect(provider.upsertContact).toHaveBeenCalledWith("access", {
      email: "person@example.com",
    });
    expect(store.claimNote).toHaveBeenCalledWith("user-1", scanId, 7);
    expect(provider.createNote).toHaveBeenCalledWith(
      "access",
      "contact-1",
      "Reviewed note",
    );
  });

  it("revokes the refresh token before removing a connection", async () => {
    const { dependencies, store, provider } = setup();
    const response = await createHubSpotDisconnectHandler(dependencies)(
      new Request("https://example.invalid/v1/hubspot", {
        method: "DELETE",
        headers: { Authorization: "Bearer user-token" },
      }),
    );
    expect(response.status).toBe(200);
    expect(provider.revoke).toHaveBeenCalledWith(expect.anything(), "refresh");
    expect(store.deleteConnection).toHaveBeenCalledWith("user-1");
  });

  it("does not create a second note when the export already claimed one", async () => {
    const { dependencies, store, provider } = setup();
    store.claimNote.mockResolvedValueOnce(false);
    const response = await createHubSpotExportHandler(dependencies)(
      request(input),
    );
    expect(response.status).toBe(200);
    expect(provider.createNote).not.toHaveBeenCalled();
  });

  it("accepts an OAuth callback only once after consuming its state", async () => {
    const { dependencies, store, provider } = setup();
    const callback = createHubSpotCallbackHandler(dependencies);
    const request = new Request(
      "https://example.invalid/v1/hubspot/callback?code=one-time-code&state=random-state",
    );
    expect((await callback(request)).status).toBe(200);
    expect(provider.exchangeCode).toHaveBeenCalledOnce();
    expect(store.saveConnection).toHaveBeenCalledOnce();
    store.consumeState.mockResolvedValueOnce(null);
    expect((await callback(request)).status).toBe(400);
    expect(provider.exchangeCode).toHaveBeenCalledOnce();
  });
});
