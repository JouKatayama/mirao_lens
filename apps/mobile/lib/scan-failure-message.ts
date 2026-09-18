export type ScanFailureGuidance = Readonly<{
  title: string;
  message: string;
  /** Re-upload the capture still held on this device. */
  canRetrySameImage: boolean;
  /** Offer a fresh photograph. */
  canRecapture: boolean;
}>;

/**
 * Decides what a failed scan tells the user to do next.
 *
 * The three failures below need three different actions, and offering the
 * wrong one costs the user a pointless round trip: a transient provider
 * failure wants the same image again, an unreadable card wants a new
 * photograph, and a spent provider balance wants neither — the photograph was
 * never the problem, and only the operator can clear it.
 *
 * It lives here rather than inline in the screen so the branches can be
 * asserted without rendering.
 */
export function scanFailureGuidance(input: {
  status: "failed_retryable" | "failed_terminal";
  errorCode: string | null;
  /**
   * False for a scan opened from history: the capture lives on the device that
   * took it, so the same-image retry could only ever fail.
   */
  hasLocalCapture: boolean;
}): ScanFailureGuidance {
  if (input.errorCode === "quota_exhausted") {
    return {
      title: "いまは読み取りを実行できません",
      message:
        "この試用環境でAIを利用できる上限に達しました。撮影し直しても解消しません。運営担当者にお知らせください。",
      canRetrySameImage: false,
      canRecapture: false,
    };
  }

  const canRetrySameImage =
    input.status === "failed_retryable" && input.hasLocalCapture;

  if (canRetrySameImage) {
    return {
      title: "読み取りを再試行できます",
      message: "一時的に名刺を読み取れませんでした。同じ画像で再試行できます。",
      canRetrySameImage: true,
      canRecapture: true,
    };
  }

  return {
    title: "撮り直してください",
    message: "名刺を読み取れませんでした。お手数ですが新しく撮影してください。",
    canRetrySameImage: false,
    canRecapture: true,
  };
}
