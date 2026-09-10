# Golden dataset

This directory is reserved for cross-stage AI evaluation cases. Evaluation
assets must contain no real personal or business-card data.

AI evaluation belongs here rather than being hidden among ordinary unit tests.

## Case locations

Cases are implemented in `@miraio/test-fixtures` (`packages/test-fixtures/src/`):

| File                          | Stage             | Cases |
| ----------------------------- | ----------------- | ----- |
| `card-extraction-fixtures.ts` | Card Intelligence | 10    |
| `flash-brief-fixtures.ts`     | Flash Brief       | 15    |
| `mutual-value-fixtures.ts`    | Mutual Value      | 10    |

**Total: 35 synthetic cases** (≥ 30 required per product spec §15).

## 項目割り当ての実測ケース

| File                    | 対象                        | Cases |
| ----------------------- | --------------------------- | ----- |
| `card-text-fixtures.ts` | OCRテキスト→8項目の割り当て | 20    |

上の35ケースは「合成されたプロバイダー出力」を検証するもので、実モデルの精度は測れません。`card-text-fixtures.ts`
は実モデルを測るためのセットで、OCRが読んだ行を入力として与え、氏名・会社・部署・役職など
8項目への割り当てを正解と照らし合わせます。向け先を変えても同じ尺度で比較できるので、OpenAI とローカルモデルを
並べられます（`packages/ai/src/card-field-assignment.eval.test.ts`、`docs/local-ai-provider.md`）。

文字認識（OCR）自体の精度はここでは測れません。合成画像には斜め・影・反射・折れがなく、
実際の撮影条件を表さないためです。そちらは架空の実物名刺を撮影した少数セットで別途測る必要があります。

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
