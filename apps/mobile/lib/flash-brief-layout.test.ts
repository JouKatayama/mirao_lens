import { describe, expect, it } from "vitest";

import {
  claimTypeAccessibilityLabel,
  claimTypeLabel,
  flashBriefBelowFoldSections,
  flashBriefFirstViewSections,
  flashBriefSectionOrder,
  personIdentityLine,
} from "./flash-brief-layout";

describe("flashBriefSectionOrder", () => {
  it("shows every section exactly once", () => {
    expect([...flashBriefSectionOrder].sort()).toEqual(
      ["person", "potential", "say_this", "who", "why_you"].sort(),
    );
    expect(new Set(flashBriefSectionOrder).size).toBe(
      flashBriefSectionOrder.length,
    );
  });

  it("puts the question to ask ahead of everything but the person", () => {
    // The regression this guards: SAY THIS used to sit below WHO and WHY YOU,
    // which put it off a 375×812 screen on the one screen that promises a
    // five-second read.
    expect(flashBriefSectionOrder.indexOf("say_this")).toBe(1);
    expect(flashBriefSectionOrder.indexOf("say_this")).toBeLessThan(
      flashBriefSectionOrder.indexOf("why_you"),
    );
    expect(flashBriefSectionOrder.indexOf("say_this")).toBeLessThan(
      flashBriefSectionOrder.indexOf("who"),
    );
  });

  it("keeps the question and the reason in the first view", () => {
    expect(flashBriefFirstViewSections).toContain("say_this");
    expect(flashBriefFirstViewSections).toContain("why_you");
    expect(flashBriefFirstViewSections).toContain("person");
    expect(flashBriefBelowFoldSections).toEqual(["who", "potential"]);
  });
});

describe("personIdentityLine", () => {
  it("joins company and title into one line", () => {
    expect(
      personIdentityLine({ company: "株式会社サンプル", title: "営業部 部長" }),
    ).toBe("株式会社サンプル・営業部 部長");
  });

  it("reads on its own when only one of them is known", () => {
    expect(
      personIdentityLine({ company: "株式会社サンプル", title: null }),
    ).toBe("株式会社サンプル");
    expect(personIdentityLine({ company: null, title: "営業部 部長" })).toBe(
      "営業部 部長",
    );
  });

  it("is absent rather than empty when the card gave neither", () => {
    expect(personIdentityLine({ company: null, title: null })).toBeNull();
    expect(personIdentityLine({ company: "  ", title: "" })).toBeNull();
  });
});

describe("claimTypeLabel", () => {
  it("names the claim in words, never colour alone", () => {
    expect(claimTypeLabel("fact")).toBe("事実");
    expect(claimTypeLabel("hypothesis")).toBe("仮説");
  });

  it("announces the claim together with the section it labels", () => {
    expect(claimTypeAccessibilityLabel("WHY YOU", "hypothesis")).toBe(
      "WHY YOU（仮説）",
    );
  });
});
