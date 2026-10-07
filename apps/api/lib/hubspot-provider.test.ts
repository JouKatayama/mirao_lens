import { describe, expect, it, vi } from "vitest";

import {
  HubSpotProvider,
  decryptTokens,
  encryptTokens,
  type HubSpotTokens,
} from "./hubspot-provider";

const tokens: HubSpotTokens = {
  access_token: "access-test",
  refresh_token: "refresh-test",
  expires_in: 1800,
  hub_id: 123,
};

describe("HubSpot provider", () => {
  it("encrypts tokens with an authenticated cipher", () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptTokens(tokens, key);
    expect(encrypted).not.toContain(tokens.access_token);
    expect(decryptTokens(encrypted, key)).toEqual(tokens);
    expect(() => decryptTokens(encrypted, Buffer.alloc(32, 8))).toThrow();
  });

  it("uses email upsert and sends only reviewed contact properties", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ results: [{ id: "contact-1" }] }),
    );
    const provider = new HubSpotProvider(fetcher);
    const id = await provider.upsertContact("test-token", {
      email: "person@example.invalid",
      company: "Example Co",
    });
    expect(id).toBe("contact-1");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/objects/2026-03/contacts/batch/upsert",
      expect.objectContaining({
        body: JSON.stringify({
          inputs: [
            {
              id: "person@example.invalid",
              idProperty: "email",
              properties: {
                email: "person@example.invalid",
                company: "Example Co",
              },
            },
          ],
        }),
      }),
    );
  });
});
