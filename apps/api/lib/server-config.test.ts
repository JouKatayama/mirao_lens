import { describe, expect, it } from "vitest";

import {
  readCompanyWebSearchEnabled,
  readOpenAICardExtractionConfig,
  readOpenAICompanyContextConfig,
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

describe("company web research configuration", () => {
  it("is off when unset or explicitly off", () => {
    expect(readCompanyWebSearchEnabled({})).toBe(false);
    expect(readCompanyWebSearchEnabled({ AI_COMPANY_WEB_SEARCH: "" })).toBe(
      false,
    );
    expect(readCompanyWebSearchEnabled({ AI_COMPANY_WEB_SEARCH: "OFF" })).toBe(
      false,
    );
  });

  it("is on only for the exact opt-in value", () => {
    expect(readCompanyWebSearchEnabled({ AI_COMPANY_WEB_SEARCH: "on" })).toBe(
      true,
    );
    expect(readCompanyWebSearchEnabled({ AI_COMPANY_WEB_SEARCH: " On " })).toBe(
      true,
    );
  });

  it("treats an ambiguous value as a configuration defect", () => {
    for (const value of ["true", "1", "yes", "enabled"]) {
      expect(() =>
        readCompanyWebSearchEnabled({ AI_COMPANY_WEB_SEARCH: value }),
      ).toThrow(ServerConfigurationError);
    }
  });

  it("refuses to combine research with a self-hosted provider", () => {
    expect(() =>
      readCompanyWebSearchEnabled({
        AI_COMPANY_WEB_SEARCH: "on",
        AI_PROVIDER_BASE_URL: "http://127.0.0.1:11434/v1",
      }),
    ).toThrow(ServerConfigurationError);
  });

  it("still reads a self-hosted provider while research is off", () => {
    expect(
      readOpenAICompanyContextConfig({
        AI_COMPANY_CONTEXT_MODEL: "gemma4:12b",
        AI_PROVIDER_BASE_URL: "http://127.0.0.1:11434/v1",
        OPENAI_API_KEY: "unused-locally",
      }),
    ).toEqual({
      apiKey: "unused-locally",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "gemma4:12b",
      webSearch: false,
    });
  });
});
