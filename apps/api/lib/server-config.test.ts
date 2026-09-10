import { describe, expect, it } from "vitest";

import {
  readOpenAICardExtractionConfig,
  readOpenAIPersonalContextConfig,
  readServerSupabaseConfig,
  ServerConfigurationError,
} from "./server-config";

describe("server configuration", () => {
  it("reads only server-side Supabase and AI values", () => {
    expect(
      readServerSupabaseConfig({
        SUPABASE_URL: "http://127.0.0.1:56321/",
        SUPABASE_PUBLISHABLE_KEY: "publishable",
      }),
    ).toEqual({
      url: "http://127.0.0.1:56321",
      publishableKey: "publishable",
    });
    expect(
      readOpenAIPersonalContextConfig({
        OPENAI_API_KEY: "server-secret",
        AI_PERSONAL_CONTEXT_MODEL: "configured-model",
      }),
    ).toEqual({ apiKey: "server-secret", model: "configured-model" });
    expect(
      readOpenAICardExtractionConfig({
        AI_CARD_EXTRACTION_MODEL: "configured-card-model",
        OPENAI_API_KEY: "server-secret",
      }),
    ).toEqual({ apiKey: "server-secret", model: "configured-card-model" });
  });

  it("fails closed when required values are missing", () => {
    expect(() => readServerSupabaseConfig({})).toThrow(
      ServerConfigurationError,
    );
    expect(() => readOpenAIPersonalContextConfig({})).toThrow(
      ServerConfigurationError,
    );
    expect(() => readOpenAICardExtractionConfig({})).toThrow(
      ServerConfigurationError,
    );
  });

  it("leaves the provider base URL unset by default", () => {
    expect(
      readOpenAICardExtractionConfig({
        AI_CARD_EXTRACTION_MODEL: "configured-card-model",
        OPENAI_API_KEY: "server-secret",
      }).baseUrl,
    ).toBeUndefined();
  });

  it("reads a provider base URL for every AI stage", () => {
    const environment = {
      AI_CARD_EXTRACTION_MODEL: "local-vision-model",
      AI_PROVIDER_BASE_URL: "http://127.0.0.1:11434/v1/",
      AI_PERSONAL_CONTEXT_MODEL: "local-text-model",
      OPENAI_API_KEY: "unused-locally",
    };

    expect(readOpenAICardExtractionConfig(environment).baseUrl).toBe(
      "http://127.0.0.1:11434/v1",
    );
    expect(readOpenAIPersonalContextConfig(environment).baseUrl).toBe(
      "http://127.0.0.1:11434/v1",
    );
  });

  it("rejects a malformed provider base URL instead of falling back to OpenAI", () => {
    // Falling back would send card images to a third party from a deployment
    // that had configured local inference, so a typo has to fail loudly.
    expect(() =>
      readOpenAICardExtractionConfig({
        AI_CARD_EXTRACTION_MODEL: "local-vision-model",
        AI_PROVIDER_BASE_URL: "127.0.0.1:11434",
        OPENAI_API_KEY: "unused-locally",
      }),
    ).toThrow(ServerConfigurationError);
    expect(() =>
      readOpenAICardExtractionConfig({
        AI_CARD_EXTRACTION_MODEL: "local-vision-model",
        AI_PROVIDER_BASE_URL: "file:///etc/passwd",
        OPENAI_API_KEY: "unused-locally",
      }),
    ).toThrow(ServerConfigurationError);
  });
});
