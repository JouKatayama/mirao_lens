import type { AnalyticsEvent } from "@miraio/domain";

export interface AnalyticsClient {
  identify(userId: string): void;
  track(event: AnalyticsEvent): void;
  reset(): void;
}

export class NoopAnalyticsClient implements AnalyticsClient {
  identify(_userId: string): void {
    void _userId;
  }
  track(_event: AnalyticsEvent): void {
    void _event;
  }
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
    // Calling the native fetch as a method of this class sets `this` to the
    // instance, which browsers reject with "Illegal invocation". That TypeError
    // is thrown synchronously, so the `.catch` below never attaches and the
    // failure escapes into `track` callers. Bind the default so it keeps its
    // own receiver while tests can still inject a fake.
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {}

  identify(userId: string): void {
    this.distinctId = userId;
  }

  track(event: AnalyticsEvent): void {
    const distinctId = this.distinctId;
    if (!distinctId) return;

    // A synchronous throw here would escape the `.catch` below and surface in
    // whatever product flow emitted the event, so the send is guarded too.
    try {
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
    } catch {
      // Analytics failures are non-fatal.
    }
  }

  reset(): void {
    this.distinctId = null;
  }
}

export function createAnalyticsClient(
  environment: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch.bind(globalThis),
): AnalyticsClient {
  const config = readAnalyticsConfig(environment);
  if (!config) return new NoopAnalyticsClient();
  return new PostHogAnalyticsClient(config, fetchImpl);
}
