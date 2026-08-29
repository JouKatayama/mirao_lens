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
});
