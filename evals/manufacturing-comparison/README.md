# 製造業 A/B/C 比較（ML-030）

2026-11-01 の製造業特化AI営業戦略（Section 6）の比較を、机上で回すための仕組みです。

> 製造業向けAI・DX企業の営業担当者は、ChatGPTを手作業で使うよりも、
> Miraio Lensを用いる方が現場で有益な質問を素早く選べるか。

## 3つの条件

| 条件 | 内容                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| A    | 汎用ChatGPT：営業担当者が手で打ちそうな依頼文（スキーマ・事実/仮説ルールなし） |
| B    | 現行Miraio：出荷中の Flash Brief                                               |
| C    | Playbook版：Opportunity Playbook（ML-029）を付けた Flash Brief                 |

3条件とも**同じモデル・同じ名刺・同じ会社情報・同じ自社Context**を使います。違うのは方法だけです。

## ケース

`packages/test-fixtures/src/manufacturing-comparison-fixtures.ts`

- 商材3種（外観検査AI／予知保全／製造業向けAIエージェント）× 相手8人 = **24ケース**
- 情報量を `rich`（会社情報あり）／`thin`（名刺のみ）／`minimal`（会社名や部署だけ）に分けています
- すべて架空の人物・企業で、ドメインは `.invalid` です

## 手順

### 1. 生成（実AIを呼ぶ・課金あり）

```bash
MIRAIO_RUN_MANUFACTURING_COMPARISON=1 AI_COMPARISON_MODEL=<model> pnpm --filter @miraio/ai exec vitest run src/manufacturing-comparison.eval.test.ts
```

`OPENAI_API_KEY` が必要です。`AI_PROVIDER_BASE_URL` を設定すると、ローカルモデルでも同じ比較ができます。

`evals/reports/`（git管理外）に3ファイルを書きます。

| ファイル                                     | 中身                                                 | 評価者が見てよいか |
| -------------------------------------------- | ---------------------------------------------------- | ------------------ |
| `manufacturing-comparison-latest.json`       | ケースごとの質問を X / Y / Z のラベルで並べたもの    | 見る               |
| `manufacturing-comparison-ratings.json`      | 評価の記入用テンプレート（既にあれば上書きしません） | 記入する           |
| `manufacturing-comparison-measurements.json` | 条件名つきの応答時間・エラー・使われたPlaybook       | **見ない**         |

X / Y / Z と条件の対応はケースごとに変わるので、「長いのはいつもMiraio」のように見分けることはできません。

### 2. ブラインド評価

`ratings.json` の各ケースで、X / Y / Z それぞれに記入します。

- `would_use`：この質問を実際の会話でそのまま（または少し直して）使うか
- `misleading`：仮説を相手企業の事実のように言っている、または誤った前提があるか
- `rank`：3つの中の順位（1が最良。1・2・3を一度ずつ使う）
- `notes`：任意

できれば製造業向けAI・DX企業の営業担当者に評価してもらいます（戦略 6.2）。

### 3. 集計

```bash
MIRAIO_RUN_MANUFACTURING_COMPARISON_SUMMARY=1 pnpm --filter @miraio/ai exec vitest run src/manufacturing-comparison.eval.test.ts
```

条件ごとの採用率・平均順位・1位の数・誤解の件数を、全体と情報量別に出します。記入途中のケースは集計に含めません。

判定（`verdict`）：

- `playbook_leads`：C の採用率が A・B より高く、平均順位も最良で、誤解が0件
- `no_playbook_advantage`：評価済みだが、C が上回っていない
- `incomplete`：まだ評価がない

## この比較で分からないこと

- **ChatGPTを手で使う時間**：A は1回の呼び出しなので、プロンプトを考えて打つ時間は入りません。現場の Trial で測ります。
- **実際の採用・商談進展**：机上の「使うか」は意向で、実際に使われたかどうかではありません。
- 少数ケースの結果は方向判断に使い、PMFの証明としては扱いません（戦略 7）。

戦略 6.3 の判断ルールどおり、C が A・B と差がなければ、知識の拡張より UX や会話後フォローなど別の価値を優先する根拠になります。
