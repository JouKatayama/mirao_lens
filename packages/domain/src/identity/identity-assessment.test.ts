import { describe, expect, it } from "vitest";

import {
  assessCardIdentity,
  emailDomainMatchesCompany,
  emailDomainOf,
  normalizePersonName,
} from "./identity-assessment";

describe("normalizePersonName", () => {
  it("folds spacing and width variants of the same name together", () => {
    expect(normalizePersonName("山田 太郎")).toBe(
      normalizePersonName("山田太郎"),
    );
    expect(normalizePersonName("山田　太郎")).toBe(
      normalizePersonName("山田太郎"),
    );
    expect(normalizePersonName("Ｔａｒｏ Yamada")).toBe(
      normalizePersonName("taro  yamada"),
    );
  });

  it("keeps different names apart", () => {
    expect(normalizePersonName("山田太郎")).not.toBe(
      normalizePersonName("山田次郎"),
    );
  });
});

describe("emailDomainOf", () => {
  it("returns the lower-cased domain of a single address", () => {
    expect(emailDomainOf(" Taro@Example.CO.JP ")).toBe("example.co.jp");
  });

  it.each([null, undefined, "", "no-at-sign", "a@b@c.com", "@example.com"])(
    "returns null for %j",
    (value) => {
      expect(emailDomainOf(value)).toBeNull();
    },
  );

  it("returns null for a domain without a dot", () => {
    expect(emailDomainOf("taro@localhost")).toBeNull();
  });
});

describe("emailDomainMatchesCompany", () => {
  it("matches a label equal to the company's first distinctive word", () => {
    expect(emailDomainMatchesCompany("sample.co.jp", "Sample Inc.")).toBe(true);
    expect(emailDomainMatchesCompany("mail.acme.com", "The Acme Group")).toBe(
      true,
    );
  });

  it("matches a label equal to the company's words run together", () => {
    expect(
      emailDomainMatchesCompany("acme-robotics.example", "Acme Robotics"),
    ).toBe(true);
  });

  it("does not match on a mere substring of a label", () => {
    expect(emailDomainMatchesCompany("globalexample.com", "Global Tech")).toBe(
      false,
    );
    expect(emailDomainMatchesCompany("notsample.jp", "Sample Inc.")).toBe(
      false,
    );
  });

  it("never matches a company name with no Latin words", () => {
    expect(emailDomainMatchesCompany("sample.co.jp", "株式会社サンプル")).toBe(
      false,
    );
  });

  it("ignores words too short to be distinctive", () => {
    expect(emailDomainMatchesCompany("ab.com", "AB Inc.")).toBe(false);
  });

  it("does not treat a free-mail domain as the company's", () => {
    expect(emailDomainMatchesCompany("gmail.com", "Sample Inc.")).toBe(false);
  });
});

describe("assessCardIdentity", () => {
  const base = {
    company: "Sample Inc.",
    emailDomain: null,
    name: "山田太郎",
    seenAtSameOrganization: false,
  } as const;

  it("is unresolved without a name", () => {
    expect(assessCardIdentity({ ...base, name: "  " })).toBe("unresolved");
  });

  it("is unresolved without a company, even for a previously seen name", () => {
    expect(
      assessCardIdentity({
        ...base,
        company: null,
        seenAtSameOrganization: true,
      }),
    ).toBe("unresolved");
  });

  it("is medium confidence for name and company alone", () => {
    expect(assessCardIdentity(base)).toBe("medium_confidence");
  });

  it("is high confidence when the email domain is the company's", () => {
    expect(assessCardIdentity({ ...base, emailDomain: "sample.co.jp" })).toBe(
      "high_confidence",
    );
  });

  it("stays medium confidence when the email domain is someone else's", () => {
    expect(assessCardIdentity({ ...base, emailDomain: "gmail.com" })).toBe(
      "medium_confidence",
    );
  });

  it("is high confidence for the same name seen at the same organization", () => {
    expect(assessCardIdentity({ ...base, seenAtSameOrganization: true })).toBe(
      "high_confidence",
    );
  });

  it("never returns verified from card data", () => {
    const statuses = [
      assessCardIdentity(base),
      assessCardIdentity({ ...base, emailDomain: "sample.co.jp" }),
      assessCardIdentity({ ...base, seenAtSameOrganization: true }),
    ];

    expect(statuses).not.toContain("verified");
  });
});
