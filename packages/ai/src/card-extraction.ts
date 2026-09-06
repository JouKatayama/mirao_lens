import {
  cardExtractionStructuredOutputSchema,
  normalizeCardExtraction,
  type CardExtraction,
  type ScanImageContentType,
} from "@miraio/domain";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { classifyProviderFailure } from "./provider-error";

export type CardExtractionErrorCode =
  | "configuration"
  | "invalid_output"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

export class CardExtractionError extends Error {
  constructor(readonly code: CardExtractionErrorCode) {
    super(`Card extraction failed: ${code}.`);
    this.name = "CardExtractionError";
  }
}

export type CardImageInput = Readonly<{
  bytes: ArrayBuffer;
  contentType: ScanImageContentType;
}>;

export interface CardExtractor {
  extract(image: CardImageInput): Promise<CardExtraction>;
}

type StructuredOutputRequest = (request: {
  dataUrl: string;
  model: string;
}) => Promise<unknown>;

export type OpenAICardExtractorOptions = Readonly<{
  apiKey?: string;
  model: string;
  request?: StructuredOutputRequest;
}>;

const systemInstructions = `
You are the Card Intelligence transcription stage for Miraio Lens.

Read only text visibly present on the supplied front-side business card. Return
the eight required nullable fields and a confidence from 0 to 1 for every
field. Use null and confidence 0 when a value is absent, illegible, ambiguous,
or only inferred. Preserve visible spelling and script; do not translate.
Use language "ja", "en", "mixed", "und", or a short visible locale identifier.

Do not use outside knowledge. Do not infer a company domain from an email, a
company from a logo alone, a title from a department, or any identity,
personality, gender, nationality, seniority, relationship, or public-web fact.
If more than one phone or email is printed, preserve the visible values in one
field separated by a newline. Never add commentary outside the schema.
`.trim();

function toProviderError(error: unknown): CardExtractionError {
  if (error instanceof CardExtractionError) {
    return error;
  }

  return new CardExtractionError(classifyProviderFailure(error));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 32_768;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }

  return btoa(chunks.join(""));
}

function createOpenAIRequest(apiKey: string): StructuredOutputRequest {
  const client = new OpenAI({ apiKey });

  return async ({ dataUrl, model }) => {
    const response = await client.responses.parse({
      input: [
        { role: "system", content: systemInstructions },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Transcribe the visible business-card facts only.",
            },
            {
              detail: "high",
              image_url: dataUrl,
              type: "input_image",
            },
          ],
        },
      ],
      model,
      store: false,
      text: {
        format: zodTextFormat(
          cardExtractionStructuredOutputSchema,
          "card_extraction",
        ),
      },
    });

    return response.output_parsed;
  };
}

export class OpenAICardExtractor implements CardExtractor {
  private readonly model: string;
  private readonly request: StructuredOutputRequest;

  constructor(options: OpenAICardExtractorOptions) {
    this.model = options.model.trim();

    if (!this.model) {
      throw new CardExtractionError("configuration");
    }

    if (options.request) {
      this.request = options.request;
      return;
    }

    const apiKey = options.apiKey?.trim();

    if (!apiKey) {
      throw new CardExtractionError("configuration");
    }

    this.request = createOpenAIRequest(apiKey);
  }

  async extract(image: CardImageInput): Promise<CardExtraction> {
    try {
      if (image.bytes.byteLength === 0) {
        throw new CardExtractionError("invalid_output");
      }

      const output = await this.request({
        dataUrl: `data:${image.contentType};base64,${arrayBufferToBase64(image.bytes)}`,
        model: this.model,
      });

      if (output === null || output === undefined) {
        throw new CardExtractionError("invalid_output");
      }

      return normalizeCardExtraction(output);
    } catch (error) {
      if (
        error instanceof CardExtractionError &&
        error.code === "invalid_output"
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === "ZodError") {
        throw new CardExtractionError("invalid_output");
      }

      throw toProviderError(error);
    }
  }
}
