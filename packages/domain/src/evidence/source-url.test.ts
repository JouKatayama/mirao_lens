import { describe, expect, it } from "vitest";

import {
  classifyCompanySourceType,
  toEmailHost,
  toPublicHttpUrl,
  toUrlHost,
} from "./source-url";

describe("toPublicHttpUrl", () => {
  it("accepts web links", () => {
    expect(toPublicHttpUrl("https://example.invalid/about")).toBe(
      "https://example.invalid/about",
    );
    expect(toPublicHttpUrl("  http://example.invalid  ")).toBe(
      "http://example.invalid/",
    );
  });

  it("rejects an absent or blank value", () => {
    expect(toPublicHttpUrl(null)).toBeNull();
    expect(toPublicHttpUrl(undefined)).toBeNull();
    expect(toPublicHttpUrl("  ")).toBeNull();
  });

  it("rejects schemes that would leave the browser", () => {
    expect(toPublicHttpUrl("javascript:alert(1)")).toBeNull();
    expect(toPublicHttpUrl("mailto:a@example.invalid")).toBeNull();
    expect(toPublicHttpUrl("file:///etc/passwd")).toBeNull();
    expect(toPublicHttpUrl("miraio://scan/1")).toBeNull();
  });

  it("rejects a value that is not a URL", () => {
    expect(toPublicHttpUrl("example.invalid/about")).toBeNull();
  });
});

describe("toUrlHost", () => {
  it("normalizes the host", () => {
    expect(toUrlHost("https://WWW.Example.co.jp/company")).toBe(
      "example.co.jp",
    );
  });

  it("returns null for a non-web value", () => {
    expect(toUrlHost("not a url")).toBeNull();
  });
});

describe("toEmailHost", () => {
  it("reads the domain", () => {
    expect(toEmailHost("taro@Example.co.jp")).toBe("example.co.jp");
  });

  it("rejects a value that is not an address", () => {
    expect(toEmailHost("taro")).toBeNull();
    expect(toEmailHost("@example.co.jp")).toBeNull();
    expect(toEmailHost("taro@localhost")).toBeNull();
    expect(toEmailHost(null)).toBeNull();
  });
});

describe("classifyCompanySourceType", () => {
  const card = {
    email: "taro@example.co.jp",
    website: "https://www.example.co.jp",
  };

  it("treats the card's own domain as the official source", () => {
    expect(
      classifyCompanySourceType("https://example.co.jp/company", card),
    ).toBe("official_company");
  });

  it("treats a subdomain of the card domain as official", () => {
    expect(classifyCompanySourceType("https://ir.example.co.jp/", card)).toBe(
      "official_company",
    );
  });

  it("treats anything else as public web", () => {
    expect(classifyCompanySourceType("https://news.invalid/a", card)).toBe(
      "public_web",
    );
  });

  it("matches on the email domain when no website was printed", () => {
    expect(
      classifyCompanySourceType("https://example.co.jp/news", {
        email: "taro@example.co.jp",
        website: null,
      }),
    ).toBe("official_company");
  });

  it("does not treat a lookalike domain as official", () => {
    expect(
      classifyCompanySourceType(
        "https://example.co.jp.attacker.invalid/",
        card,
      ),
    ).toBe("public_web");
  });

  it("falls back to public web when the card carries no domain at all", () => {
    expect(
      classifyCompanySourceType("https://example.co.jp/", {
        email: null,
        website: null,
      }),
    ).toBe("public_web");
  });
});
