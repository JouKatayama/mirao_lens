import type {
  ConnectionType,
  FollowUpDecision,
  FollowUpDraft,
  FollowUpRecommendation,
} from "@miraio/domain";

/**
 * The device-side end of a follow-up (spec §2.4). The app never sends: after
 * approval it opens the device's own compose screen with the draft filled in,
 * or hands the text to the share sheet. The user presses send.
 */

export const followUpDecisionLabels: Record<FollowUpDecision, string> = {
  follow_up: "フォローする",
  hold: "保留",
  no_follow_up: "今回は見送り",
};

export const connectionTypeLabels: Record<ConnectionType, string> = {
  introduced_by: "紹介",
  knows: "知り合い",
  worked_with: "一緒に働いた",
};

/** A `mailto:` link, or null when the card carries no usable address. */
export function buildFollowUpMailto(
  email: string | null,
  draft: FollowUpDraft,
): string | null {
  const address = email?.trim();

  if (!address || !/^[^\s@,;?]+@[^\s@,;?]+$/.test(address)) {
    return null;
  }

  const query = [
    `subject=${encodeURIComponent(draft.subject)}`,
    `body=${encodeURIComponent(draft.body)}`,
  ].join("&");

  return `mailto:${encodeURIComponent(address).replace("%40", "@")}?${query}`;
}

/** The text handed to the share sheet when there is no address to mail. */
export function formatFollowUpShareText(draft: FollowUpDraft): string {
  return `${draft.subject}\n\n${draft.body}`;
}

/** Whether the recommendation can still be acted on. */
export function isFollowUpPending(
  recommendation: FollowUpRecommendation | null,
): boolean {
  return recommendation?.status === "suggested";
}
