import type { FlashBriefPublic } from "@miraio/domain";

/**
 * Reading order for the Flash Brief.
 *
 * The brief is read standing up, in the seconds after a card changes hands,
 * so the order is a product decision rather than a layout detail: the screen
 * calls itself a five-second brief, and what the user is supposed to say next
 * has to be visible before anything they would have to scroll for.
 */
export type FlashBriefSectionId =
  "person" | "say_this" | "why_you" | "who" | "potential";

/**
 * What a 375×812 screen has to show without scrolling: who this is, the
 * question to open with, why they are relevant, and whether that reason is a
 * fact or a hypothesis.
 */
export const flashBriefFirstViewSections = [
  "person",
  "say_this",
  "why_you",
] as const satisfies readonly FlashBriefSectionId[];

/**
 * Still part of the brief, but read after the conversation has started: the
 * longer description of the person and the potential heuristic.
 */
export const flashBriefBelowFoldSections = [
  "who",
  "potential",
] as const satisfies readonly FlashBriefSectionId[];

export const flashBriefSectionOrder: readonly FlashBriefSectionId[] = [
  ...flashBriefFirstViewSections,
  ...flashBriefBelowFoldSections,
];

/**
 * Company and title on one line. Two lines of header cost more than they are
 * worth when the space belongs to the question the user is about to ask; both
 * facts are still shown, and either one alone still reads.
 */
export function personIdentityLine(card: {
  company: string | null;
  title: string | null;
}): string | null {
  const parts = [card.company, card.title]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join("・") : null;
}

/**
 * Fact and hypothesis are never distinguished by colour alone: the badge
 * carries the word, and the screen reader announces it with the claim it
 * belongs to.
 */
export function claimTypeLabel(
  claimType: FlashBriefPublic["why_you_claim_type"],
): string {
  return claimType === "fact" ? "事実" : "仮説";
}

export function claimTypeAccessibilityLabel(
  sectionLabel: string,
  claimType: FlashBriefPublic["why_you_claim_type"],
): string {
  return `${sectionLabel}（${claimTypeLabel(claimType)}）`;
}
