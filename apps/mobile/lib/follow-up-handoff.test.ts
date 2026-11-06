import { describe, expect, it } from "vitest";

import {
  buildFollowUpMailto,
  formatFollowUpShareText,
} from "./follow-up-handoff";

const draft = {
  body: "本日は&ありがとうございました。\n{署名}",
  subject: "御礼",
};

describe("buildFollowUpMailto", () => {
  it("encodes the subject and body", () => {
    const url = buildFollowUpMailto("contact@example.invalid", draft);

    expect(url).toBe(
      `mailto:contact@example.invalid?subject=${encodeURIComponent("御礼")}&body=${encodeURIComponent(draft.body)}`,
    );
  });

  it("returns null without a usable address", () => {
    expect(buildFollowUpMailto(null, draft)).toBeNull();
    expect(buildFollowUpMailto("  ", draft)).toBeNull();
    expect(buildFollowUpMailto("a@b.invalid?cc=x@y.invalid", draft)).toBeNull();
  });
});

describe("formatFollowUpShareText", () => {
  it("puts the subject above the body", () => {
    expect(formatFollowUpShareText(draft)).toBe(`御礼\n\n${draft.body}`);
  });
});
