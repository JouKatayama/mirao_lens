import {
  evidenceListResponseSchema,
  interactionNoteResponseSchema,
  nextActionResponseSchema,
  scanCreateResponseSchema,
  scanListResponseSchema,
  scanStatusResponseSchema,
  type CardCorrection,
  type EvidenceListResponse,
  type InteractionNoteResponse,
  type MeetingGoal,
  type NextActionRequest,
  type NextActionResponse,
  type ScanCreateResponse,
  type ScanImageContentType,
  type ScanListResponse,
  type ScanStatusResponse,
} from "@miraio/domain";

import { readMobileApiConfig } from "./api-config";

type Fetch = typeof fetch;

type ErrorEnvelope = {
  error?: { code?: unknown; message?: unknown; scan_id?: unknown };
};

export class ScanApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly scanId?: string,
  ) {
    super(message);
    this.name = "ScanApiError";
  }
}

async function toApiError(response: Response): Promise<ScanApiError> {
  let envelope: ErrorEnvelope = {};

  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    // Keep the public fallback for empty or non-JSON upstream responses.
  }

  return new ScanApiError(
    response.status,
    typeof envelope.error?.code === "string"
      ? envelope.error.code
      : "request_failed",
    typeof envelope.error?.message === "string"
      ? envelope.error.message
      : "The scan could not be created.",
    typeof envelope.error?.scan_id === "string"
      ? envelope.error.scan_id
      : undefined,
  );
}

export class ScanApiClient {
  constructor(
    private readonly baseUrl: string,
    // Calling the native fetch as a method of this class sets `this` to the
    // instance, which browsers reject with "Illegal invocation". React Native
    // tolerates it, so the web target is the one that breaks. Bind the default
    // so it keeps its own receiver while tests can still inject a fake.
    private readonly fetchImplementation: Fetch = fetch.bind(globalThis),
  ) {}

  async createScan(
    accessToken: string,
    input: Readonly<{
      bytes: ArrayBuffer;
      contentType: ScanImageContentType;
      meetingGoal: MeetingGoal;
      scanId: string;
    }>,
  ): Promise<ScanCreateResponse> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/v1/scans`,
      {
        body: input.bytes,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": input.contentType,
          "X-Meeting-Goal": input.meetingGoal,
          "X-Scan-Id": input.scanId,
        },
        method: "POST",
      },
    );

    if (!response.ok) {
      throw await toApiError(response);
    }

    return scanCreateResponseSchema.parse(await response.json());
  }

  async getStatus(
    accessToken: string,
    scanId: string,
  ): Promise<ScanStatusResponse> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/v1/scans/${scanId}/status`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      throw await toApiError(response);
    }

    return scanStatusResponseSchema.parse(await response.json());
  }

  async correctCard(
    accessToken: string,
    scanId: string,
    correction: CardCorrection,
  ): Promise<ScanStatusResponse> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/v1/scans/${scanId}/card`,
      {
        body: JSON.stringify(correction),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "PATCH",
      },
    );

    if (!response.ok) {
      throw await toApiError(response);
    }

    return scanStatusResponseSchema.parse(await response.json());
  }

  async getEvidence(
    accessToken: string,
    scanId: string,
  ): Promise<EvidenceListResponse> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/v1/scans/${scanId}/evidence`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      throw await toApiError(response);
    }

    return evidenceListResponseSchema.parse(await response.json());
  }

  async listScans(accessToken: string): Promise<ScanListResponse> {
    const response = await this.fetchImplementation(`${this.baseUrl}/v1/scans`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw await toApiError(response);
    }

    return scanListResponseSchema.parse(await response.json());
  }

  async saveNote(
    accessToken: string,
    scanId: string,
    noteText: string,
  ): Promise<InteractionNoteResponse> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/v1/scans/${scanId}/note`,
      {
        body: JSON.stringify({ note_text: noteText }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    if (!response.ok) {
      throw await toApiError(response);
    }

    return interactionNoteResponseSchema.parse(await response.json());
  }

  async deleteScan(accessToken: string, scanId: string): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/v1/scans/${scanId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "DELETE",
      },
    );

    if (!response.ok) {
      throw await toApiError(response);
    }
  }

  async deleteAccount(accessToken: string): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/v1/account`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "DELETE",
      },
    );

    if (!response.ok) {
      throw await toApiError(response);
    }
  }

  async saveNextAction(
    accessToken: string,
    scanId: string,
    request: NextActionRequest,
  ): Promise<NextActionResponse> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/v1/scans/${scanId}/next-action`,
      {
        body: JSON.stringify(request),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    if (!response.ok) {
      throw await toApiError(response);
    }

    return nextActionResponseSchema.parse(await response.json());
  }
}

export function createScanApiClient(): ScanApiClient {
  const { baseUrl } = readMobileApiConfig(process.env);
  return new ScanApiClient(baseUrl);
}
