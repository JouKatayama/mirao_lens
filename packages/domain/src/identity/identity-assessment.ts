import type { IdentityStatus } from "../flash-brief/flash-brief";

/**
 * Canonical form of a person's name for deciding whether two cards name the
 * same person. Width variants and spacing differ between cards of the same
 * person ("山田 太郎" / "山田太郎", full-width Latin), so both are folded away.
 */
export function normalizePersonName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
}

/** Domain part of a single well-formed address, lower-cased; otherwise null. */
export function emailDomainOf(email: string | null | undefined): string | null {
  const parts = email?.trim().split("@");

  if (parts?.length !== 2 || !parts[0]) {
    return null;
  }

  const domain = parts[1]?.toLowerCase() ?? "";

  return domain.includes(".") ? domain : null;
}

const legalFormWords = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "gmbh",
  "group",
  "holdings",
  "inc",
  "kk",
  "llc",
  "ltd",
  "plc",
  "the",
]);

/**
 * Whether an email domain carries the company's own name as one of its labels.
 *
 * A substring test is not enough: it let "Global Tech" match any domain that
 * merely contained "global", and a match here is strong enough to report the
 * person as high confidence. Only a whole label equal to the company's first
 * distinctive word, or to its words run together, counts. Company names with
 * no Latin words cannot be compared this way and never match.
 */
export function emailDomainMatchesCompany(
  emailDomain: string,
  company: string,
): boolean {
  const words = company
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && !legalFormWords.has(word));
  const candidates = new Set(
    [words[0] ?? "", words.join("")].filter(
      (candidate) => candidate.length >= 3,
    ),
  );

  return emailDomain
    .toLowerCase()
    .split(".")
    .some((label) => candidates.has(label.replace(/[^a-z0-9]/g, "")));
}

export type CardIdentitySignals = Readonly<{
  company: string | null;
  emailDomain: string | null;
  name: string | null;
  /**
   * The user already scanned a card carrying the same normalized name at the
   * same organization. A matching name alone is not this signal: same-name
   * people at different companies are the case the spec calls out.
   */
  seenAtSameOrganization: boolean;
}>;

/**
 * Identity confidence that card data alone can support. The result becomes a
 * floor the Flash Brief stage may not lower, so every branch errs toward the
 * weaker status: presenting the wrong person as confirmed is the pilot's
 * zero-tolerance guardrail, while an understated status only costs detail.
 */
export function assessCardIdentity(
  signals: CardIdentitySignals,
): IdentityStatus {
  const name = signals.name?.trim();
  const company = signals.company?.trim();

  if (!name || !company) {
    return "unresolved";
  }

  if (signals.seenAtSameOrganization) {
    return "high_confidence";
  }

  if (
    signals.emailDomain &&
    emailDomainMatchesCompany(signals.emailDomain, company)
  ) {
    return "high_confidence";
  }

  return "medium_confidence";
}
