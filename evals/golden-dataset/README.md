# Golden dataset

This directory is reserved for cross-stage AI evaluation cases. Evaluation
assets must contain no real personal or business-card data.

AI evaluation belongs here rather than being hidden among ordinary unit tests.

## Case locations

Cases are implemented in `@miraio/test-fixtures` (`packages/test-fixtures/src/`):

| File | Stage | Cases |
|------|-------|-------|
| `card-extraction-fixtures.ts` | Card Intelligence | 10 |
| `flash-brief-fixtures.ts` | Flash Brief | 15 |
| `mutual-value-fixtures.ts` | Mutual Value | 10 |

**Total: 35 synthetic cases** (≥ 30 required per product spec §15).

## What each case contains

**Card extraction** (`FlashBriefCase`):
- `caseName` — unique identifier
- `providerOutput` — synthetic AI structured output
- `expectedNonNullFields` — fields that must be non-null after normalization

**Flash Brief** (`FlashBriefCase`):
- `caseName` — unique identifier  
- `description` — what scenario this tests
- `input` — `FlashBriefInput` (card + personal context + meeting goal)
- `expectations.allowed_identity_statuses` — acceptable identity status values
- `expectations.forbidden_substrings` — strings that must not appear in output
- `input.prior_identity_status` (optional) — ML-009 confidence floor

**Mutual Value** (`MutualValueCase`):
- `caseName` — unique identifier
- `description` — what scenario this tests
- `input` — `MutualValueInput` (card + flash brief + personal context)
- `expectations.required_claim_types` — claim types that must appear in GIVE/GET
- `expectations.forbidden_substrings` — strings that must not appear
- `expectations.min_give_count` / `min_ask_count` — minimum item counts

## Automated assertions

`eval-assertions.ts` provides `runFlashBriefAssertions` and `runMutualValueAssertions`.
These run structural checks (no forbidden substrings, identity floor, evidence_ids empty, 
claim type coverage) without a live AI call.

## Human scoring

Use the 8-dimension rubric in `eval-rubric.ts` to score real AI outputs 1–5 per dimension.
`summarizeEvalResults` aggregates scores across cases.

## Adding cases

All cases must:
- Contain no real PII (use `.invalid` domains, fictional names / companies)
- Cover a distinct scenario (check for duplicate `caseName` values — tests enforce uniqueness)
- Pass the existing harness tests without modification
