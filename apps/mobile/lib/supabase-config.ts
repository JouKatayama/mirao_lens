export type MobileSupabaseConfig = Readonly<{
  publishableKey: string;
  url: string;
}>;

type MobileEnvironment = Readonly<Record<string, string | undefined>>;

function requireValue(value: string | undefined, description: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(
      `Missing ${description}. Check the local Expo environment.`,
    );
  }

  return normalized;
}

export function readMobileSupabaseConfig(
  environment: MobileEnvironment,
): MobileSupabaseConfig {
  const url = requireValue(
    environment.EXPO_PUBLIC_SUPABASE_URL,
    "EXPO_PUBLIC_SUPABASE_URL",
  );
  const publishableKey = requireValue(
    environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      environment.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY",
  );

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL must use HTTP or HTTPS.");
  }

  return { publishableKey, url: parsedUrl.toString().replace(/\/$/, "") };
}
