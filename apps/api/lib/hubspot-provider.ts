import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { HubSpotExportRequest } from "@miraio/domain";

export type HubSpotConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenKey: Buffer;
}>;

export function readHubSpotConfig(
  environment: NodeJS.ProcessEnv,
): HubSpotConfig {
  const clientId = environment.HUBSPOT_CLIENT_ID?.trim();
  const clientSecret = environment.HUBSPOT_CLIENT_SECRET?.trim();
  const redirectUri = environment.HUBSPOT_REDIRECT_URI?.trim();
  const tokenKey = Buffer.from(
    environment.HUBSPOT_TOKEN_ENCRYPTION_KEY ?? "",
    "base64",
  );
  if (!clientId || !clientSecret || !redirectUri || tokenKey.length !== 32) {
    throw new Error("hubspot_unconfigured");
  }
  const url = new URL(redirectUri);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  ) {
    throw new Error("hubspot_invalid_redirect");
  }
  return { clientId, clientSecret, redirectUri, tokenKey };
}

export type HubSpotTokens = Readonly<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  hub_id: number;
}>;

export function encryptTokens(tokens: HubSpotTokens, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptTokens(value: string, key: Buffer): HubSpotTokens {
  const [iv, tag, ciphertext] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !ciphertext)
    throw new Error("invalid_hubspot_token_store");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(),
  ) as HubSpotTokens;
}

export function authorizationUrl(config: HubSpotConfig, state: string): string {
  const url = new URL("https://app.hubspot.com/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "crm.objects.contacts.write");
  url.searchParams.set("state", state);
  return url.toString();
}

async function hubSpotJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`hubspot_http_${response.status}`);
  return response.json();
}

export class HubSpotProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async token(
    config: HubSpotConfig,
    values: Record<string, string>,
  ): Promise<HubSpotTokens> {
    const response = await this.fetcher(
      "https://api.hubapi.com/oauth/2026-03/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          ...values,
        }).toString(),
      },
    );
    const data = (await hubSpotJson(response)) as Partial<HubSpotTokens>;
    if (
      !data.access_token ||
      !data.refresh_token ||
      !data.expires_in ||
      !data.hub_id
    ) {
      throw new Error("hubspot_invalid_token_response");
    }
    return data as HubSpotTokens;
  }

  exchangeCode(config: HubSpotConfig, code: string): Promise<HubSpotTokens> {
    return this.token(config, {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    });
  }

  refresh(config: HubSpotConfig, refreshToken: string): Promise<HubSpotTokens> {
    return this.token(config, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  async upsertContact(
    accessToken: string,
    contact: HubSpotExportRequest["contact"],
  ): Promise<string> {
    const response = await this.fetcher(
      "https://api.hubapi.com/crm/objects/2026-03/contacts/batch/upsert",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: [
            { id: contact.email, idProperty: "email", properties: contact },
          ],
        }),
      },
    );
    const data = (await hubSpotJson(response)) as {
      results?: Array<{ id?: string }>;
    };
    const id = data.results?.[0]?.id;
    if (!id) throw new Error("hubspot_contact_upsert_incomplete");
    return id;
  }

  async createNote(
    accessToken: string,
    contactId: string,
    body: string,
  ): Promise<string> {
    const response = await this.fetcher(
      "https://api.hubapi.com/crm/objects/2026-03/notes",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          associations: [
            {
              to: { id: contactId },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 202,
                },
              ],
            },
          ],
          properties: {
            hs_note_body: body,
            hs_timestamp: new Date().toISOString(),
          },
        }),
      },
    );
    const data = (await hubSpotJson(response)) as { id?: string };
    if (!data.id) throw new Error("hubspot_note_create_incomplete");
    return data.id;
  }

  async revoke(config: HubSpotConfig, refreshToken: string): Promise<void> {
    const response = await this.fetcher(
      "https://api.hubapi.com/oauth/2026-03/token/revoke",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          token: refreshToken,
          token_type_hint: "refresh_token",
        }).toString(),
      },
    );
    if (!response.ok) throw new Error(`hubspot_revoke_${response.status}`);
  }
}
