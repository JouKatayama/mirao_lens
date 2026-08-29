import type { AnalyticsEvent } from "@miraio/domain";

export interface AnalyticsClient {
  identify(userId: string): void;
  track(event: AnalyticsEvent): void;
  reset(): void;
}

export class NoopAnalyticsClient implements AnalyticsClient {
  identify(_userId: string): void {}
  track(_event: AnalyticsEvent): void {}
  reset(): void {}
}

type PostHogConfig = Readonly<{
  apiKey: string;
  host: string;
}>;

export function readAnalyticsConfig(
  environment: Record<string, string | undefined>,
): PostHogConfig | null {
  const apiKey = environment["EXPO_PUBLIC_POSTHOG_API_KEY"]?.trim();
  if (!apiKey) return null;
  const host =
    environment["EXPO_PUBLIC_POSTHOG_HOST"]?.trim() ??
    "https://us.i.posthog.com";
  return { apiKey, host };
}

export class PostHogAnalyticsClient implements AnalyticsClient {
  private distinctId: string | null = null;

  constructor(
    private readonly config: PostHogConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  identify(userId: string): void {
    this.distinctId = userId;
  }

  track(event: AnalyticsEvent): void {
    const distinctId = this.distinctId;
    if (!distinctId) return;

    void this.fetchImpl(`${this.config.host}/capture/`, {
      body: JSON.stringify({
        api_key: this.config.apiKey,
        event: event.name,
        properties: {
          $lib: "miraio-lens-mobile",
          distinct_id: distinctId,
          ...event.properties,
        },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => {
      // Analytics failures are non-fatal.
    });
  }

  reset(): void {
    this.distinctId = null;
  }
}

export function createAnalyticsClient(
  environment: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): AnalyticsClient {
  const config = readAnalyticsConfig(environment);
  if (!config) return new NoopAnalyticsClient();
  return new PostHogAnalyticsClient(config, fetchImpl);
}
