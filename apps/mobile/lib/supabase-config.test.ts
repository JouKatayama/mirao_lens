import { describe, expect, it } from "vitest";

import { readMobileSupabaseConfig } from "./supabase-config";

describe("readMobileSupabaseConfig", () => {
  it("reads the current publishable-key contract", () => {
    expect(
      readMobileSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
        EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321/",
      }),
    ).toEqual({
      publishableKey: "publishable-key",
      url: "http://127.0.0.1:56321",
    });
  });

  it("supports the legacy anon-key environment name", () => {
    expect(
      readMobileSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }).publishableKey,
    ).toBe("anon-key");
  });

  it("fails without exposing any credential value", () => {
    expect(() =>
      readMobileSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        EXPO_PUBLIC_SUPABASE_URL: "not-a-url",
      }),
    ).toThrow("Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});
