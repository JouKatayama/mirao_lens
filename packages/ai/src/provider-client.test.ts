import { describe, expect, it } from "vitest";

import {
  createOpenAIClient,
  providerTimeoutMilliseconds,
} from "./provider-client";

describe("createOpenAIClient", () => {
  it("keeps the bounded call budget every stage depends on", () => {
    const client = createOpenAIClient(
      "key",
      providerTimeoutMilliseconds.companyContext,
    );

    expect(client.timeout).toBe(providerTimeoutMilliseconds.companyContext);
    expect(client.maxRetries).toBe(0);
  });

  it("talks to OpenAI when no base URL is configured", () => {
    const client = createOpenAIClient(
      "key",
      providerTimeoutMilliseconds.cardExtraction,
    );

    expect(client.baseURL).toContain("openai.com");
  });

  it("targets an OpenAI-compatible server when a base URL is configured", () => {
    const client = createOpenAIClient(
      "key",
      providerTimeoutMilliseconds.cardExtraction,
      "http://127.0.0.1:11434/v1",
    );

    expect(client.baseURL).toBe("http://127.0.0.1:11434/v1");
  });

  it("keeps every stage budget inside the 60s route deadline", () => {
    const cardPipeline =
      providerTimeoutMilliseconds.cardExtraction +
      providerTimeoutMilliseconds.companyContext +
      providerTimeoutMilliseconds.flashBrief +
      providerTimeoutMilliseconds.mutualValue;

    expect(cardPipeline).toBeLessThan(60_000);
  });
});
