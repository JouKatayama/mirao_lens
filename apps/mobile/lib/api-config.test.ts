import { describe, expect, it } from "vitest";

import { readMobileApiConfig } from "./api-config";

describe("readMobileApiConfig", () => {
  it("normalizes the public BFF origin", () => {
    expect(
      readMobileApiConfig({
        EXPO_PUBLIC_API_BASE_URL: "http://localhost:3000/",
      }),
    ).toEqual({ baseUrl: "http://localhost:3000" });
  });

  it("rejects missing or unsafe URL schemes", () => {
    expect(() => readMobileApiConfig({})).toThrow(
      "Missing EXPO_PUBLIC_API_BASE_URL",
    );
    expect(() =>
      readMobileApiConfig({ EXPO_PUBLIC_API_BASE_URL: "file:///tmp/api" }),
    ).toThrow("must use HTTP or HTTPS");
  });
});
