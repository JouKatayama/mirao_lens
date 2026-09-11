import { describe, expect, it } from "vitest";

import {
  createOpenAIClient,
  isReasoningEffort,
  providerTimeoutMilliseconds,
  toReasoningParameter,
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

describe("reasoning effort", () => {
  it("accepts every value the GPT-5.6 family supports", () => {
    for (const value of ["none", "low", "medium", "high", "xhigh", "max"]) {
      expect(isReasoningEffort(value)).toBe(true);
    }
  });

  it("rejects minimal, which those models answer with a 400", () => {
    expect(isReasoningEffort("minimal")).toBe(false);
  });

  it("rejects anything else", () => {
    for (const value of ["", "LOW", "default", "standard", "1"]) {
      expect(isReasoningEffort(value)).toBe(false);
    }
  });

  it("omits the parameter when no effort is configured", () => {
    expect(toReasoningParameter(undefined)).toEqual({});
  });

  it("sends the configured effort", () => {
    expect(toReasoningParameter("low")).toEqual({
      reasoning: { effort: "low" },
    });
  });
});
