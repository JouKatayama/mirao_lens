import {
  hubSpotExportRequestSchema,
  type HubSpotExportRequest,
} from "@miraio/domain";

import { readMobileApiConfig } from "./api-config";

export class HubSpotApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async request(
    token: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok)
      throw new Error(`HubSpot request failed (${response.status}).`);
    return response;
  }

  async status(
    token: string,
  ): Promise<{ connected: boolean; hub_id: number | null }> {
    const response = await this.request(token, "/v1/hubspot");
    const body = (await response.json()) as {
      connected?: unknown;
      hub_id?: unknown;
    };
    if (typeof body.connected !== "boolean")
      throw new Error("Invalid HubSpot status.");
    return {
      connected: body.connected,
      hub_id: typeof body.hub_id === "number" ? body.hub_id : null,
    };
  }

  async authorize(token: string): Promise<string> {
    const response = await this.request(token, "/v1/hubspot/authorize", {
      method: "POST",
    });
    const body = (await response.json()) as { authorization_url?: unknown };
    if (typeof body.authorization_url !== "string")
      throw new Error("Invalid HubSpot authorization URL.");
    const url = new URL(body.authorization_url);
    if (url.protocol !== "https:" || url.hostname !== "app.hubspot.com")
      throw new Error("Invalid HubSpot authorization host.");
    return url.toString();
  }

  async disconnect(token: string): Promise<void> {
    await this.request(token, "/v1/hubspot", { method: "DELETE" });
  }

  async export(
    token: string,
    input: HubSpotExportRequest,
  ): Promise<{ contact_id: string; note_status: string }> {
    const body = hubSpotExportRequestSchema.parse(input);
    const response = await this.request(token, "/v1/hubspot/export", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return response.json() as Promise<{
      contact_id: string;
      note_status: string;
    }>;
  }
}

export function createHubSpotApiClient(): HubSpotApiClient {
  return new HubSpotApiClient(readMobileApiConfig(process.env).baseUrl);
}
