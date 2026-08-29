import type {
  FlashBriefPublic,
  IdentityStatus,
  MutualValuePublic,
} from "@miraio/domain";

import type { FlashBriefCase } from "./flash-brief-fixtures";
import type { MutualValueCase } from "./mutual-value-fixtures";

export type AssertionResult = Readonly<{
  name: string;
  passed: boolean;
  message?: string;
}>;

// Identity confidence order: lower index = lower confidence.
const IDENTITY_ORDER: readonly IdentityStatus[] = [
  "unresolved",
  "medium_confidence",
  "high_confidence",
  "verified",
];

function identityRank(status: IdentityStatus): number {
  return IDENTITY_ORDER.indexOf(status);
}

function checkNoForbiddenSubstrings(
  texts: readonly string[],
  forbidden: readonly string[],
): AssertionResult {
  for (const text of texts) {
    for (const f of forbidden) {
      if (text.toLowerCase().includes(f.toLowerCase())) {
        return {
          name: "no_forbidden_substrings",
          passed: false,
          message: `Output contains forbidden substring: "${f}"`,
        };
      }
    }
  }
  return { name: "no_forbidden_substrings", passed: true };
}

function checkIdentityStatusAllowed(
  actual: IdentityStatus,
  allowed: readonly IdentityStatus[],
): AssertionResult {
  const passed = allowed.includes(actual);
  return {
    name: "identity_status_allowed",
    passed,
    message: passed
      ? undefined
      : `Identity status "${actual}" not in allowed set [${allowed.join(", ")}]`,
  };
}

function checkIdentityStatusFloor(
  actual: IdentityStatus,
  floor: IdentityStatus,
): AssertionResult {
  const passed = identityRank(actual) >= identityRank(floor);
  return {
    name: "identity_status_floor",
    passed,
    message: passed
      ? undefined
      : `Identity status "${actual}" is below required floor "${floor}"`,
  };
}

// Runs all automated assertions for a Flash Brief output against its golden
// case expectations. Returns one AssertionResult per check.
export function runFlashBriefAssertions(
  output: FlashBriefPublic,
  cas: FlashBriefCase,
): AssertionResult[] {
  const allText: string[] = [
    output.who,
    output.why_you,
    output.potential,
    ...output.say_this,
  ];

  const results: AssertionResult[] = [];

  results.push(
    checkNoForbiddenSubstrings(allText, cas.expectations.forbidden_substrings),
  );
  results.push(
    checkIdentityStatusAllowed(
      output.identity_status,
      cas.expectations.allowed_identity_statuses,
    ),
  );

  if (cas.input.prior_identity_status) {
    results.push(
      checkIdentityStatusFloor(
        output.identity_status,
        cas.input.prior_identity_status,
      ),
    );
  }

  return results;
}

// Runs all automated assertions for a Mutual Value output against its golden
// case expectations. Returns one AssertionResult per check.
export function runMutualValueAssertions(
  output: MutualValuePublic,
  cas: MutualValueCase,
): AssertionResult[] {
  const allText: string[] = [
    ...output.give.map((i) => i.text),
    ...output.get.map((i) => i.text),
    output.bridge,
    ...output.ask.map((i) => i.question),
    output.next_action.action,
    output.next_action.reason,
  ];

  const results: AssertionResult[] = [];

  results.push(
    checkNoForbiddenSubstrings(allText, cas.expectations.forbidden_substrings),
  );

  // evidence_ids must be empty before the post-generation linking step.
  const allItems = [...output.give, ...output.get];
  const nonEmpty = allItems.filter((i) => i.evidence_ids.length > 0);
  results.push({
    name: "evidence_ids_empty",
    passed: nonEmpty.length === 0,
    message:
      nonEmpty.length === 0
        ? undefined
        : `${nonEmpty.length} item(s) have non-empty evidence_ids (expected [] before linking)`,
  });

  // Required claim types must be present in GIVE or GET items.
  const foundClaimTypes = new Set(allItems.map((i) => i.claim_type));
  for (const required of cas.expectations.required_claim_types) {
    const present = foundClaimTypes.has(required);
    results.push({
      name: `claim_type_present:${required}`,
      passed: present,
      message: present
        ? undefined
        : `No item with claim_type "${required}" found`,
    });
  }

  results.push({
    name: "min_give_count",
    passed: output.give.length >= cas.expectations.min_give_count,
    message:
      output.give.length >= cas.expectations.min_give_count
        ? undefined
        : `GIVE has ${output.give.length} item(s), expected ≥ ${cas.expectations.min_give_count}`,
  });

  results.push({
    name: "min_ask_count",
    passed: output.ask.length >= cas.expectations.min_ask_count,
    message:
      output.ask.length >= cas.expectations.min_ask_count
        ? undefined
        : `ASK has ${output.ask.length} item(s), expected ≥ ${cas.expectations.min_ask_count}`,
  });

  return results;
}
