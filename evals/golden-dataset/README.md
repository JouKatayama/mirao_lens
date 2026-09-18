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

## ペルソナ由来のケース

| File                  | 対象                      | Cases |
| --------------------- | ------------------------- | ----- |
| `persona-fixtures.ts` | 利用者ペルソナ × 交換相手 | 9     |

上の35ケースは一件ずつ状況を手で書いたもので、網羅の幅は書き手の想像力が上限です。
ペルソナは「利用者が誰か」を一度だけ定義し、その人が実際に名刺を交換する相手を並べます。
ケースはその掛け算なので、相手を1人足せばケースが1件増え、ペルソナを1本足せば集合が倍化します。

現在のペルソナは3本（SaaS法人営業／人材紹介の法人営業／地方銀行の法人渉外）で、
これは形を示すための種です。誰が最も名刺を交換するのかを調べたうえで、差し替え・追加していく前提です。
`buildPersonaFlashBriefCases` は既存の `FlashBriefCase` 形に展開するため、
既存の決定的アサーションがそのまま適用されます。

ペルソナでも文字認識（OCR）の精度は測れません。名刺は解析済みのフィールドとして与えるため、
測れるのは推論ステージだけです。

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
