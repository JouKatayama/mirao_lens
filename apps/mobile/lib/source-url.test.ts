import { describe, expect, it } from "vitest";

import { toOpenableSourceUrl } from "./source-url";

describe("toOpenableSourceUrl", () => {
  it("accepts http and https links", () => {
    expect(toOpenableSourceUrl("https://example.invalid/about")).toBe(
      "https://example.invalid/about",
    );
    expect(toOpenableSourceUrl("http://example.invalid")).toBe(
      "http://example.invalid/",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(toOpenableSourceUrl("  https://example.invalid/  ")).toBe(
      "https://example.invalid/",
    );
  });

  it("rejects a missing or empty value", () => {
    expect(toOpenableSourceUrl(null)).toBeNull();
    expect(toOpenableSourceUrl("   ")).toBeNull();
  });

  it("rejects schemes that would leave the browser", () => {
    expect(toOpenableSourceUrl("javascript:alert(1)")).toBeNull();
    expect(toOpenableSourceUrl("mailto:someone@example.invalid")).toBeNull();
    expect(toOpenableSourceUrl("file:///etc/passwd")).toBeNull();
    expect(toOpenableSourceUrl("miraio://scan/1")).toBeNull();
  });

  it("rejects a value that is not a URL at all", () => {
    expect(toOpenableSourceUrl("example.invalid/about")).toBeNull();
  });
});
