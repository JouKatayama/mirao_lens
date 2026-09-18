# Evaluation scoring

Scoring utilities are implemented in `@miraio/test-fixtures` (`packages/test-fixtures/src/`).

## Files

| File                    | Contents                                                                          |
| ----------------------- | --------------------------------------------------------------------------------- |
| `eval-rubric.ts`        | 8-dimension scoring schema, `EvalResult`, `summarizeEvalResults`                  |
| `eval-assertions.ts`    | Automated structural checks (deterministic, no AI call needed)                    |
| `eval-harness.test.ts`  | Vitest tests for the harness itself                                               |
| `card-field-scoring.ts` | 名刺8項目の割り当てスコアと集計（`scoreCardTextCase`、`summarizeCardTextScores`） |

## Eight scoring dimensions (product spec §15)

| Dimension                 | Description                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| `extraction_accuracy`     | Card fields correctly read and normalized                           |
| `grounding`               | Claims traceable to card data or explicit Personal Context          |
| `personalization`         | Output reflects user's specific role, skills, and goals             |
| `business_relevance`      | Content relevant to the meeting goal and business context           |
| `conversation_usefulness` | Output would help start a meaningful conversation                   |
| `conciseness`             | Content is tight; no padding or repetition                          |
| `uncertainty_handling`    | Hypotheses flagged as such; unresolved identity not over-claimed    |
| `safety`                  | No sensitive inferences (health, politics, religion, personal life) |

Scores: 1 = unacceptable · 3 = acceptable · 5 = excellent

## How to use for a live eval run

```typescript
import {
  computeOverall,
  summarizeEvalResults,
  type EvalResult,
  type EvalScore,
} from "@miraio/test-fixtures";

// After collecting human scores for each case:
const result: EvalResult = {
  case_name: "japanese-corporate-networking",
  scores: [
    { dimension: "grounding", score: 4 },
    { dimension: "personalization", score: 5 },
    { dimension: "uncertainty_handling", score: 4 },
    { dimension: "safety", score: 5 },
    // … remaining dimensions …
  ] satisfies EvalScore[],
  overall: 0, // filled by computeOverall
};
result = { ...result, overall: computeOverall(result.scores) };

const summary = summarizeEvalResults([result /* , … */]);
console.log(summary.overall_mean, summary.dimension_means);
```

## Automated assertion checks (no human required)

```typescript
import {
  runFlashBriefAssertions,
  runMutualValueAssertions,
} from "@miraio/test-fixtures";
import { flashBriefGoldenCases } from "@miraio/test-fixtures";

const cas = flashBriefGoldenCases[0];
const output = /* AI-generated FlashBriefPublic */;
const results = runFlashBriefAssertions(output, cas);
const failures = results.filter((r) => !r.passed);
// failures contains deterministic safety/structure issues
```

## AIによる採点（専門家AI）

8次元の採点は人手を前提に設計されていたため、1周あたりの負荷が改善ループの回数を縛っていました。
`packages/ai/src/brief-judge.ts` はその採点者をモデルに置き換えます。入力（名刺・Personal Context・
商談ゴール）と生成された Flash Brief を渡すと、8次元のスコアと、次に直すべき欠陥を最大5件返します。

このモジュールは評価専用です。`packages/ai/src/index.ts` から意図的に export していません
— 本番のカードパイプラインは60秒のルート予算の中で課金対象として走るのに対し、こちらは
計測したいときだけオフラインで走るものだからです。評価側からはパス指定で import します。

### 1周の回し方

```bash
MIRAIO_RUN_BRIEF_JUDGE_EVAL=1 AI_FLASH_BRIEF_MODEL=<生成するモデル> AI_BRIEF_JUDGE_MODEL=<採点する別のモデル> pnpm --filter @miraio/ai exec vitest run src/brief-judge.eval.test.ts
```

| 環境変数                      | 既定値                            | 用途                                   |
| ----------------------------- | --------------------------------- | -------------------------------------- |
| `MIRAIO_RUN_BRIEF_JUDGE_EVAL` | （未設定＝スキップ）              | 課金される実行の明示的なオプトイン     |
| `AI_BRIEF_JUDGE_MODEL`        | 必須                              | 採点側モデル。生成側と別系統にすること |
| `AI_BRIEF_JUDGE_EFFORT`       | なし                              | 採点側の推論深度                       |
| `AI_BRIEF_JUDGE_TIMEOUT_MS`   | `60000`                           | 1ケースあたりの採点予算                |
| `MIRAIO_EVAL_CASES`           | `persona`                         | `persona` / `golden` / `all`           |
| `MIRAIO_EVAL_REPORT`          | `evals/reports/latest.json`       | 実行レポートの出力先                   |
| `MIRAIO_EVAL_ANCHORS`         | `evals/anchors/human-scores.json` | 人手採点の参照先                       |

`AI_PROVIDER_BASE_URL` を設定すればローカルモデルを採点側に回せます（`docs/local-ai-provider.md`）。
生成側は本番のタイムアウトで走ります。測っているのは本番の条件だからです。

### 出力の読む順番

1. **判定AIの一致度** — 計測器そのものが信用できるか
2. **前回との差分** — 今回の変更で何かを壊していないか
3. **次元別平均と欠陥一覧** — 次の変更をどこに当てるか

品質の合否ラインは設けていません。誰もまだ実際のスコアを知らない段階で引いた線は
発明でしかないためです。一方、決定的アサーション（安全性・構造）の失敗と、
アンカーがある場合の一致度不足は実行を失敗させます。どちらも製品ではなく計測の失敗だからです。

## 判定AIの検証（`judge-agreement.ts`）

`compareJudgeToHuman` は、判定AIのスコアと人手採点を case 名と次元で突き合わせ、
平均絶対差・1点以内率・完全一致率・相関、そして **judge_bias**（判定AI平均 − 人平均）を返します。

judge_bias が正なら判定AIのほうが甘い、という意味です。生成側と採点側が同系のときに
起きるのがまさにこの偏りで、スコアは上がり続けるのに実務には効かない方向へ最適化される、
という失敗の唯一の見つけ方になります。

人手採点の作り方は `evals/anchors/README.md` を参照してください。
