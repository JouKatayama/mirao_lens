const onboardingFallback =
  "候補を作成できませんでした。入力内容を保ったまま再試行できます。";

function readApiError(
  cause: unknown,
): Readonly<{ code: string; status: number }> | null {
  if (
    typeof cause !== "object" ||
    cause === null ||
    !("status" in cause) ||
    !("code" in cause) ||
    typeof cause.status !== "number" ||
    typeof cause.code !== "string"
  ) {
    return null;
  }

  return { code: cause.code, status: cause.status };
}

/**
 * Turns the API's stable public error codes into recovery guidance suitable
 * for a pilot user. Provider details stay server-side.
 */
export function onboardingErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.name === "ZodError") {
    return "「今の役割」と「提供できること」は必ず入力してください。";
  }

  // Match the stable public shape rather than relying on `instanceof`.
  // Development hot reloads and different JavaScript realms can each create
  // another copy of the error class even though the response is valid.
  const apiError = readApiError(cause);

  if (!apiError) {
    return onboardingFallback;
  }

  if (apiError.status === 429 || apiError.code === "ai_rate_limited") {
    return "AIの利用が混み合っています。入力内容は保持されています。1分ほど待ってから再試行してください。";
  }

  // Deliberately not the rate-limit message above: retrying changes nothing
  // here, and the only person who can fix it is not the one reading this.
  if (apiError.code === "ai_quota_exhausted") {
    return "この試用環境でAIを利用できる上限に達しました。入力内容は保持されています。運営担当者にお知らせください。";
  }

  if (apiError.code === "ai_unconfigured") {
    return "この試用環境ではAIの準備が完了していません。入力内容は保持されています。運営担当者にお知らせください。";
  }

  if (apiError.status === 401 || apiError.code === "unauthorized") {
    return "ログインの有効期限が切れました。もう一度ログインしてお試しください。";
  }

  if (apiError.status === 502 || apiError.code === "ai_invalid_output") {
    return "AIの回答を確認できませんでした。入力内容は保持されています。もう一度お試しください。";
  }

  if (apiError.status === 503 || apiError.code === "ai_unavailable") {
    return "AIに一時的に接続できません。入力内容は保持されています。少し待ってから再試行してください。";
  }

  return onboardingFallback;
}
