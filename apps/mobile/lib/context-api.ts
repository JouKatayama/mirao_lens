import {
  personalContextItemSchema,
  personalContextOnboardingResponseSchema,
  personalContextResponseSchema,
  type PersonalContextItem,
  type PersonalContextItemUpdate,
  type PersonalContextOnboardingInput,
  type PersonalContextOnboardingResponse,
  type PersonalContextResponse,
} from "@miraio/domain";

import { readMobileApiConfig } from "./api-config";

type Fetch = typeof fetch;

export class ContextApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ContextApiError";
  }
}

type ErrorEnvelope = {
  error?: { code?: unknown; message?: unknown };
};

async function toApiError(response: Response): Promise<ContextApiError> {
  let envelope: ErrorEnvelope = {};

  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    // Keep the public fallback below; response bodies may be empty upstream.
  }

  const code =
    typeof envelope.error?.code === "string"
      ? envelope.error.code
      : "request_failed";
  const message =
    typeof envelope.error?.message === "string"
      ? envelope.error.message
      : "The request could not be completed.";

  return new ContextApiError(response.status, code, message);
}

export class PersonalContextApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImplementation: Fetch = fetch,
  ) {}

  private async request(
    accessToken: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      throw await toApiError(response);
    }

    return response;
  }

  async getApproved(accessToken: string): Promise<PersonalContextResponse> {
    const response = await this.request(accessToken, "/v1/context");
    return personalContextResponseSchema.parse(await response.json());
  }

  async createOnboarding(
    accessToken: string,
    input: PersonalContextOnboardingInput,
  ): Promise<PersonalContextOnboardingResponse> {
    const response = await this.request(accessToken, "/v1/context/onboarding", {
      body: JSON.stringify(input),
      method: "POST",
    });
    return personalContextOnboardingResponseSchema.parse(await response.json());
  }

  async updateItem(
    accessToken: string,
    itemId: string,
    update: PersonalContextItemUpdate,
  ): Promise<PersonalContextItem> {
    const response = await this.request(
      accessToken,
      `/v1/context/${encodeURIComponent(itemId)}`,
      { body: JSON.stringify(update), method: "PATCH" },
    );
    const body = (await response.json()) as { item?: unknown };
    return personalContextItemSchema.parse(body.item);
  }

  async deleteItem(accessToken: string, itemId: string): Promise<void> {
    await this.request(
      accessToken,
      `/v1/context/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    );
  }
}

export function createPersonalContextApiClient(): PersonalContextApiClient {
  const { baseUrl } = readMobileApiConfig(process.env);
  return new PersonalContextApiClient(baseUrl);
}
