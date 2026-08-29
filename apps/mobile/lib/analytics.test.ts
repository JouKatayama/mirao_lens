import { describe, expect, it, vi } from "vitest";

import {
  createAnalyticsClient,
  NoopAnalyticsClient,
  PostHogAnalyticsClient,
  readAnalyticsConfig,
} from "./analytics";

// ─── readAnalyticsConfig ──────────────────────────────────────────────────────

describe("readAnalyticsConfig", () => {
  it("returns null when EXPO_PUBLIC_POSTHOG_API_KEY is absent", () => {
    expect(readAnalyticsConfig({})).toBeNull();
  });

  it("returns null when EXPO_PUBLIC_POSTHOG_API_KEY is only whitespace", () => {
    expect(
      readAnalyticsConfig({ EXPO_PUBLIC_POSTHOG_API_KEY: "   " }),
    ).toBeNull();
  });

  it("returns config with default host when only API key is set", () => {
    const config = readAnalyticsConfig({
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_test",
    });
    expect(config).toEqual({
      apiKey: "phc_test",
      host: "https://us.i.posthog.com",
    });
  });

  it("returns config with custom host when both vars are set", () => {
    const config = readAnalyticsConfig({
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_test",
      EXPO_PUBLIC_POSTHOG_HOST: "https://eu.posthog.example",
    });
    expect(config).toEqual({
      apiKey: "phc_test",
      host: "https://eu.posthog.example",
    });
  });
});

// ─── NoopAnalyticsClient ──────────────────────────────────────────────────────

describe("NoopAnalyticsClient", () => {
  it("does not throw for any method call", () => {
    const client = new NoopAnalyticsClient();
    expect(() => client.identify("user-1")).not.toThrow();
    expect(() => client.track({ name: "brief_viewed" })).not.toThrow();
    expect(() => client.reset()).not.toThrow();
  });
});

// ─── PostHogAnalyticsClient ───────────────────────────────────────────────────

describe("PostHogAnalyticsClient", () => {
  const config = { apiKey: "phc_test", host: "https://test.posthog.example" };

  function makeFetch() {
    return vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  }

  it("does not call fetch before identify", () => {
    const fetchMock = makeFetch();
    const client = new PostHogAnalyticsClient(config, fetchMock);
    client.track({ name: "brief_viewed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls fetch after identify", async () => {
    const fetchMock = makeFetch();
    const client = new PostHogAnalyticsClient(config, fetchMock);
    client.identify("user-abc");
    client.track({ name: "brief_viewed" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  it("sends event name and distinct_id to the PostHog capture endpoint", async () => {
    const fetchMock = makeFetch();
    const client = new PostHogAnalyticsClient(config, fetchMock);
    client.identify("user-xyz");
    client.track({ name: "scan_capture" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.posthog.example/capture/");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["event"]).toBe("scan_capture");
    const props = body["properties"] as Record<string, unknown>;
    expect(props["distinct_id"]).toBe("user-xyz");
    expect(props["$lib"]).toBe("miraio-lens-mobile");
  });

  it("includes custom properties in the payload", async () => {
    const fetchMock = makeFetch();
    const client = new PostHogAnalyticsClient(config, fetchMock);
    client.identify("user-1");
    client.track({ name: "card_corrected", properties: { field_count: 2 } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const props = body["properties"] as Record<string, unknown>;
    expect(props["field_count"]).toBe(2);
  });

  it("does not call fetch after reset", async () => {
    const fetchMock = makeFetch();
    const client = new PostHogAnalyticsClient(config, fetchMock);
    client.identify("user-1");
    client.reset();
    client.track({ name: "brief_viewed" });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("silently ignores fetch failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    const client = new PostHogAnalyticsClient(config, fetchMock);
    client.identify("user-1");
    expect(() => client.track({ name: "brief_viewed" })).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });
});

// ─── createAnalyticsClient ────────────────────────────────────────────────────

describe("createAnalyticsClient", () => {
  it("returns NoopAnalyticsClient when EXPO_PUBLIC_POSTHOG_API_KEY is absent", () => {
    const client = createAnalyticsClient({});
    expect(client).toBeInstanceOf(NoopAnalyticsClient);
  });

  it("returns PostHogAnalyticsClient when EXPO_PUBLIC_POSTHOG_API_KEY is set", () => {
    const client = createAnalyticsClient({
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_test",
    });
    expect(client).toBeInstanceOf(PostHogAnalyticsClient);
  });
});
