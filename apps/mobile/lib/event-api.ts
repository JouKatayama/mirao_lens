import {
  eventListResponseSchema,
  eventRecordSchema,
  eventScanListResponseSchema,
  eventTeamListResponseSchema,
  eventMemberRequestSchema,
  type EventTeamItem,
  type EventRecord,
  type ScanHistoryItem,
} from "@miraio/domain";

import { readMobileApiConfig } from "./api-config";

export class EventApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImplementation: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async request(token: string, path: string, init?: RequestInit) {
    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok)
      throw new Error(`Event request failed (${response.status}).`);
    return response;
  }

  async list(token: string): Promise<EventRecord[]> {
    const response = await this.request(token, "/v1/events");
    return eventListResponseSchema.parse(await response.json()).items;
  }

  async create(token: string, name: string): Promise<EventRecord> {
    const response = await this.request(token, "/v1/events", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return eventRecordSchema.parse(await response.json());
  }

  async attach(token: string, eventId: string, scanId: string): Promise<void> {
    await this.request(
      token,
      `/v1/events/${encodeURIComponent(eventId)}/scans`,
      {
        method: "POST",
        body: JSON.stringify({ scan_id: scanId }),
      },
    );
  }

  async listScans(token: string, eventId: string): Promise<ScanHistoryItem[]> {
    const response = await this.request(
      token,
      `/v1/events/${encodeURIComponent(eventId)}/scans`,
    );
    return eventScanListResponseSchema.parse(await response.json()).items;
  }

  async addMember(
    token: string,
    eventId: string,
    userId: string,
  ): Promise<void> {
    const body = eventMemberRequestSchema.parse({ member_user_id: userId });
    await this.request(
      token,
      `/v1/events/${encodeURIComponent(eventId)}/members`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async removeMember(
    token: string,
    eventId: string,
    userId: string,
  ): Promise<void> {
    const body = eventMemberRequestSchema.parse({ member_user_id: userId });
    await this.request(
      token,
      `/v1/events/${encodeURIComponent(eventId)}/members`,
      {
        method: "DELETE",
        body: JSON.stringify(body),
      },
    );
  }

  async listMembers(token: string, eventId: string): Promise<string[]> {
    const response = await this.request(
      token,
      `/v1/events/${encodeURIComponent(eventId)}/members`,
    );
    const body = (await response.json()) as { member_user_ids?: unknown };
    if (
      !Array.isArray(body.member_user_ids) ||
      !body.member_user_ids.every((id) => typeof id === "string")
    ) {
      throw new Error("Invalid event members response.");
    }
    return body.member_user_ids;
  }

  async listSharedEvents(
    token: string,
  ): Promise<Array<{ id: string; name: string; owner_user_id: string }>> {
    const response = await this.request(token, "/v1/events/shared");
    const body = (await response.json()) as { items?: unknown };
    if (!Array.isArray(body.items))
      throw new Error("Invalid shared events response.");
    return body.items as Array<{
      id: string;
      name: string;
      owner_user_id: string;
    }>;
  }

  async readTeamItems(
    token: string,
    eventId: string,
  ): Promise<EventTeamItem[]> {
    const response = await this.request(
      token,
      `/v1/events/${encodeURIComponent(eventId)}/team-items`,
    );
    return eventTeamListResponseSchema.parse(await response.json()).items;
  }
}

export function createEventApiClient(): EventApiClient {
  return new EventApiClient(readMobileApiConfig(process.env).baseUrl);
}
