import type { BusinessCardPublic, CardFieldName } from "@miraio/domain";

/** Below this a reading is flagged for the user to check before relying on it. */
export const lowConfidenceThreshold = 0.7;

/**
 * Whether a card field should be flagged as worth double-checking.
 *
 * Blank fields have nothing to check, and a field the user already corrected
 * is theirs; flagging either would teach the user to ignore the flag.
 */
export function fieldNeedsReview(
  card: BusinessCardPublic,
  field: CardFieldName,
): boolean {
  if (card[field] === null) {
    return false;
  }

  const corrected = card.claims.some(
    (claim) => claim.field === field && claim.source_type === "user_correction",
  );

  return !corrected && card.field_confidence[field] < lowConfidenceThreshold;
}
