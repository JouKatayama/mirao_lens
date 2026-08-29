export type MobileApiConfig = Readonly<{
  baseUrl: string;
}>;

type MobileEnvironment = Readonly<Record<string, string | undefined>>;

export function readMobileApiConfig(
  environment: MobileEnvironment,
): MobileApiConfig {
  const rawBaseUrl = environment.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (!rawBaseUrl) {
    throw new Error(
      "Missing EXPO_PUBLIC_API_BASE_URL. Check the local Expo environment.",
    );
  }

  let baseUrl: URL;

  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be a valid URL.");
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.");
  }

  return { baseUrl: baseUrl.toString().replace(/\/$/, "") };
}
