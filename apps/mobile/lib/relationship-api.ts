import {
  followUpResponseSchema,
  relationshipGraphResponseSchema,
  type ConnectionCreateRequest,
  type FollowUpDecisionRequest,
  type FollowUpResponse,
  type RelationshipGraphResponse,
} from "@miraio/domain";

import { readMobileApiConfig } from "./api-config";

export class RelationshipApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Relationship request failed (${status}, ${code}).`);
    this.name = "RelationshipApiError";
  }
}

/**
 * The follow-up recommendation and relationship graph for one scan (spec §2.4).
 * Nothing here sends a message: approval returns the decision, and the device
 * itself opens the compose screen.
 */
export class RelationshipApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImplementation: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async request(
    token: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      let code = "request_failed";
      try {
        const body = (await response.json()) as { error?: { code?: unknown } };
        if (typeof body.error?.code === "string") code = body.error.code;
      } catch {
        // Keep the generic code for an empty or non-JSON body.
      }
      throw new RelationshipApiError(response.status, code);
    }

    return response;
  }

  private scanPath(scanId: string, suffix: string): string {
    return `/v1/scans/${encodeURIComponent(scanId)}/${suffix}`;
  }

  async getGraph(
    token: string,
    scanId: string,
  ): Promise<RelationshipGraphResponse> {
    const response = await this.request(
      token,
      this.scanPath(scanId, "relationships"),
    );
    return relationshipGraphResponseSchema.parse(await response.json());
  }

  async addConnection(
    token: string,
    scanId: string,
    input: ConnectionCreateRequest,
  ): Promise<void> {
    await this.request(token, this.scanPath(scanId, "relationships"), {
      body: JSON.stringify(input),
      method: "POST",
    });
  }

  async deleteConnection(
    token: string,
    scanId: string,
    connectionId: string,
  ): Promise<void> {
    await this.request(
      token,
      `${this.scanPath(scanId, "relationships")}?connection_id=${encodeURIComponent(connectionId)}`,
      { method: "DELETE" },
    );
  }

  async getFollowUp(token: string, scanId: string): Promise<FollowUpResponse> {
    const response = await this.request(
      token,
      this.scanPath(scanId, "follow-up"),
    );
    return followUpResponseSchema.parse(await response.json());
  }

  async requestFollowUp(
    token: string,
    scanId: string,
  ): Promise<FollowUpResponse> {
    const response = await this.request(
      token,
      this.scanPath(scanId, "follow-up"),
      { method: "POST" },
    );
    return followUpResponseSchema.parse(await response.json());
  }

  async decideFollowUp(
    token: string,
    scanId: string,
    decision: FollowUpDecisionRequest,
  ): Promise<FollowUpResponse> {
    const response = await this.request(
      token,
      this.scanPath(scanId, "follow-up"),
      { body: JSON.stringify(decision), method: "PATCH" },
    );
    return followUpResponseSchema.parse(await response.json());
  }
}

export function createRelationshipApiClient(): RelationshipApiClient {
  return new RelationshipApiClient(readMobileApiConfig(process.env).baseUrl);
}
