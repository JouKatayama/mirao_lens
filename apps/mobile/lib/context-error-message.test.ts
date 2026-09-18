import { describe, expect, it } from "vitest";

import { ContextApiError } from "./context-api";
import { onboardingErrorMessage } from "./context-error-message";

describe("onboardingErrorMessage", () => {
  it("names the required fields when the form fails validation", () => {
    // This branch moved here out of the onboarding screen. It is the only one
    // that never reaches the network, and the screen no longer covers it.
    const message = onboardingErrorMessage(
      Object.assign(new Error("Invalid input"), { name: "ZodError" }),
    );

    expect(message).toContain("今の役割");
    expect(message).toContain("提供できること");
  });

  it("explains how to recover from an AI rate limit", () => {
    expect(
      onboardingErrorMessage(
        new ContextApiError(429, "ai_rate_limited", "Please wait."),
      ),
    ).toContain("1分ほど待ってから再試行");
  });

  it("recognizes the public error shape across JavaScript realms", () => {
    expect(
      onboardingErrorMessage({ code: "ai_rate_limited", status: 429 }),
    ).toContain("1分ほど待ってから再試行");
  });

  it("asks the pilot user to contact the operator for missing AI config", () => {
    expect(
      onboardingErrorMessage(
        new ContextApiError(503, "ai_unconfigured", "Unavailable."),
      ),
    ).toContain("運営担当者");
  });

  it("sends the user back to sign-in when the session has expired", () => {
    // The app signs out on a 401 while loading, but not while submitting
    // onboarding, so this message is what that user actually sees.
    expect(
      onboardingErrorMessage(
        new ContextApiError(401, "unauthorized", "Authentication is required."),
      ),
    ).toContain("ログイン");
  });

  it("invites a retry when the AI answer could not be validated", () => {
    const message = onboardingErrorMessage(
      new ContextApiError(502, "ai_invalid_output", "Could not validate."),
    );

    expect(message).toContain("入力内容は保持されています");
    expect(message).toContain("もう一度");
  });

  it("invites a later retry when the AI is unreachable", () => {
    const message = onboardingErrorMessage(
      new ContextApiError(503, "ai_unavailable", "Temporarily unavailable."),
    );

    expect(message).toContain("入力内容は保持されています");
    expect(message).toContain("少し待ってから");
  });

  it("gives a safe fallback without exposing unexpected details", () => {
    const message = onboardingErrorMessage(
      new Error("provider-secret-response"),
    );

    expect(message).toContain("入力内容を保ったまま");
    expect(message).not.toContain("provider-secret-response");
  });

  it("keeps a server-side failure message out of the interface", () => {
    // A 500 carries a code this file does not map, so it takes the fallback —
    // the branch where an upstream message is most likely to leak through.
    const message = onboardingErrorMessage(
      new ContextApiError(500, "database_error", "relation does not exist"),
    );

    expect(message).toContain("入力内容を保ったまま");
    expect(message).not.toContain("relation does not exist");
  });
});
