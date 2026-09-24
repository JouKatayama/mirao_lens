# 実プロバイダーでの動作確認（スモークラン）

決定論テストは差し替えたリクエスト関数を叩くだけなので、**OpenAI に実際にリクエストを送る経路は一度も実行されていません**。このドキュメントは、その経路を最小の手数と費用で通すための手順です。

確認したいのは4つです。

1. strict structured output が現行モデルで**受理されるか** — `potential_score` / `sources` / `connection_keywords` を追加したので、拒否されると `invalid_output` で全スキャンが終端失敗します
2. 各ステージの**実レイテンシ**が `packages/ai/src/provider-client.ts` の予算に収まるか。あの数値は非推論モデルで測ったものです
3. Flash Brief の **★スコアが根拠と釣り合っているか**
4. `AI_COMPANY_WEB_SEARCH=on` で **開けるURLの evidence 行が実際に入るか**

## 前提

|                  |                                                                              |
| ---------------- | ---------------------------------------------------------------------------- |
| Docker Desktop   | 起動していること（手順Aだけは不要）                                          |
| `OPENAI_API_KEY` | `apps/api/.env.local` に貼ること。gitignore 済みで、リポジトリには入りません |
| モデル           | `apps/api/.env.local` に設定済み（terra / sol）。効果段は `low` / `medium`   |

費用はモデル単価（terra $2/$12 per 1M、sol $4/$20 per 1M）に対して名刺1枚のペイロードが小さいので、数枚なら十分小さいはずです。**ただし画像トークンと web_search ツールの実費は未測定です。** 最初の数回で OpenAI のダッシュボードを確認してから枚数を増やしてください。

## A. 名刺項目の精度比較（Docker不要・最初にやる）

抽出モデルを terra にするか sol にするかは、既存の eval ハーネスで数字を見て決められます。

```bash
MIRAIO_RUN_CARD_FIELD_EVAL=1 AI_CARD_FIELD_EVAL_MODEL=gpt-5.6-terra pnpm --filter @miraio/ai exec vitest run src/card-field-assignment.eval.test.ts
```

`AI_CARD_FIELD_EVAL_MODEL` を変えて同じ20ケースを回せば同一尺度で比較できます。ここは OCR テキスト→8項目の割当を測るもので、画像からの読み取り精度そのものは手順Cで見ます。

## B. ローカル Supabase を立てる

```bash
pnpm supabase:start
```

```bash
pnpm db:reset && pnpm db:test
```

**ここで CI 任せだった2つが初めてローカルで走ります** — `apps/api/lib/card-intelligence.integration.test.ts`（常時スキップ）と `supabase/tests/database/ml018_next_action_outcome.test.sql`。

## C. 名刺1枚を実際に通す

API を起動します。

```bash
pnpm dev:api
```

`.env.local` の値を読み込み、テストユーザーを作ってアクセストークンを取ります。ローカル限定の操作です（OTPメールを拾う手間を省くため、service-role でユーザーを確認済みにして作ります）。

```bash
set -a && . apps/api/.env.local && set +a
curl -s "$SUPABASE_URL/auth/v1/admin/users" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d '{"email":"smoke@miraio.invalid","password":"smoke-password-1234","email_confirm":true}' > /dev/null
```

```bash
export TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' -d '{"email":"smoke@miraio.invalid","password":"smoke-password-1234"}' | python -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
```

Personal Context が空だと「接点」が出ないので、承認済みの項目を3件入れます（PostgREST 経由。AI 呼び出しは発生しません）。

```bash
export UID=$(curl -s "$SUPABASE_URL/auth/v1/user" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $TOKEN" | python -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -s "$SUPABASE_URL/rest/v1/personal_context_items" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d "[{\"user_id\":\"$UID\",\"type\":\"strong_skill\",\"text\":\"製造業向けのデータ基盤構築を5年リードしてきた\",\"tags\":[\"データ基盤\",\"製造業\"],\"source_type\":\"user\",\"user_approved\":true},{\"user_id\":\"$UID\",\"type\":\"offer\",\"text\":\"センサーデータの前処理と可視化の設計を手伝える\",\"tags\":[\"IoT\"],\"source_type\":\"user\",\"user_approved\":true},{\"user_id\":\"$UID\",\"type\":\"seeking\",\"text\":\"製造現場に生成AIを適用した事例を探している\",\"tags\":[\"生成AI\"],\"source_type\":\"user\",\"user_approved\":true}]" > /dev/null
```

合成名刺（架空の会社・氏名、ドメインはすべて `.invalid`）を投げます。実物の名刺は使いません — AGENTS.md が禁じており、実プロバイダーに送る以上この規則は形式論ではありません。

```bash
export SCAN_ID=$(python -c 'import uuid; print(uuid.uuid4())')
curl -s -X POST http://127.0.0.1:3000/v1/scans -H "Authorization: Bearer $TOKEN" -H 'Content-Type: image/png' -H "X-Scan-Id: $SCAN_ID" -H 'X-Meeting-Goal: networking' --data-binary @packages/test-fixtures/assets/synthetic-card-ja.png
```

```bash
curl -s "http://127.0.0.1:3000/v1/scans/$SCAN_ID/status" -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

`extracting` → `card_ready` → `brief_ready` → `deep_ready` と進みます。数秒おきに叩いてください。

## D. 見るもの

**抽出** — `card` の8項目が合成名刺と一致するか。特に氏名（架空 花子）と部署（デジタル推進本部 データ基盤部）の切り分け。

**ブリーフ** — `flash_brief.potential_score` が 1〜5 で入っているか、`connection_keywords` が上で入れたコンテキスト（データ基盤・生成AI）と噛み合っているか、`why_you_claim_type` が `hypothesis` になっているか（名刺とコンテキストだけなので `fact` が出たら根拠を疑ってください）。

**レイテンシ** — ステージごとの実測値を予算と比べます。

```bash
curl -s "$SUPABASE_URL/rest/v1/ai_runs?select=stage,model_alias,latency_ms,status&order=created_at.asc" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python -m json.tool
```

`flash_brief` が 14000ms、`card_extraction` が 20000ms に近ければ、`provider-client.ts` の予算か `AI_*_EFFORT` を調整します。P50 5秒 / P90 10秒 の目標に対してどうかもここで分かります。

**evidence** — 手順Eの前は `business_card` と `ai_inference` の2種だけのはずです。

```bash
curl -s "$SUPABASE_URL/rest/v1/evidence?select=source_type,source_title,source_url,confidence" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python -m json.tool
```

## E. 公開Web調査を入れる

`apps/api/.env.local` で `AI_COMPANY_WEB_SEARCH=on` にして API を再起動し、手順Cをもう一度実行します。

合成名刺の会社は**存在しません**。つまり正しい挙動は「検索しても何も出ず、`sources` が空、会社説明は null」です。**架空の会社の説明とURLが返ってきたら、それが捏造の証拠**なので、プロンプトかモデルを見直す判断材料になります。実在企業での挙動を見たい場合は、あなた自身の会社の名刺を1枚だけ使ってください（第三者の実物名刺は使わないこと）。

実在企業で試したときに見るのは、`evidence` に `official_company` / `public_web` の行が入り、`source_url` が実在するページを指しているかです。モバイルの根拠画面ではその行がタップ可能になります。

## F. Jev（TypeSafe）の実測

決定層は OpenAI とは別プロバイダー（TypeSafe / Jev）なので、経路も費用も別に確認します。スモークは二重に opt-in で、フラグと鍵の両方が揃わないとテストが1件も登録されません。既定の `pnpm test` から外部通信が起きることはありません。

```bash
MIRAIO_RUN_JEV_SMOKE=1 TYPESAFE_API_KEY=<key> pnpm --filter @miraio/ai exec vitest run src/providers/jev-decision-evaluator.smoke.test.ts --disable-console-intercept
```

`--disable-console-intercept` が無いと vitest が latency 行を飲み込みます。

### 2026-09-22 の実測（5サンプル）

|        | latency                        |
| ------ | ------------------------------ |
| 観測値 | 534 / 577 / 598 / 634 / 723 ms |
| 中央値 | 約 598ms                       |
| 公称値 | 70〜500ms                      |

**5サンプルすべてが公称レンジの上限を超えています。** 1サンプルごとに別プロセスなので TLS ハンドシェイクを含む「コネクション冷えた状態の1発目」であり、サーバーレスのルートが実際に見る形に近い数字です。常時接続を張れる経路なら下がる余地はありますが、それは未測定です。

同じ入力に対して**選択そのものは完全に再現**しました（5回とも `choice=technical`、期待スコア 3.00、`noul=0.90〜0.91`）。一方 `confidence` は 0.54〜0.66 で揺れます。**選択を比較指標に使うのは妥当で、confidence を閾値に使うのは早い**、というのが現時点の読みです。

費用は入力 $0.042/MTok・出力無料。1リクエストが数百トークンなので、この5回は事実上ゼロです。

### POTENTIAL_SCORE の二重採点（4サンプル）

同じスモークファイルの2本目が、生成器が自分で付けた `potential_score` と、Jev が**同じ5段階ルーブリックで**付けた点を並べて出します。評価器には生成器の点数を見せていません（見せると一致するに決まっていて、何も測れないため）。

合成ケース（生成器の自己申告 = 4）に対する4回:

|     | modal | expected | confidence | 分布 (1→5)                |
| --- | ----- | -------- | ---------- | ------------------------- |
| 1   | 4     | 4.20     | 0.53       | 0 / .02 / .14 / .46 / .38 |
| 2   | 5     | 4.38     | 0.48       | 0 / .01 / .08 / .43 / .48 |
| 3   | 4     | 4.31     | 0.52       | 0 / .01 / .11 / .44 / .44 |
| 4   | 5     | 4.31     | 0.43       | 0 / .01 / .12 / .42 / .45 |

**モーダルは 4 と 5 の間で毎回ひっくり返り、期待値は 4.20〜4.38 に収まります。** 4 と 5 の質量がほぼ拮抗しているためで、モデルの不安定さではなく「最頻値という読み方が境界付近で不連続」という性質です。

したがって**比較指標には期待値 (`expectedScore`) を使ってください。** モーダル (`modalScore`) を推移の追跡に使うと、分布がほとんど動いていないのに点数が1段階跳ねます。`expectedDecisionScore()` がこのために存在します。

このケースでは生成器の 4 と Jev の 4.3 前後が一致しています。1ケースでは何も結論できませんが、ルーブリックが実際に届いていて、分布が形になっていることは確認できました。

### IDENTITY_STATUS の二重評価

4つのラベルを `choice` で聞き、分布を見ます。カードの氏名そのものは送らず「フルネームが載っているか」という形だけを送ります（メールはドメインのみ、サイトはホストのみ、電話と Personal Context は送りません）。

合成ケース（氏名あり・会社あり・メールなし = ルーブリック上は `medium_confidence`）:

|          | modal             | 分布 high / medium / unresolved / verified |
| -------- | ----------------- | ------------------------------------------ |
| 修正前   | **unresolved**    | 0 / .13 / **.87** / 0                      |
| 修正後 1 | medium_confidence | 0 / .74 / .26 / 0                          |
| 修正後 2 | medium_confidence | 0 / .71 / .29 / 0                          |

**最初の実行で生成器と食い違い、原因はモデルではなく state のエンコードでした。** 氏名の形を `"full_name"` という裸のトークンで送っていて、それが「フルネームが存在する」と読まれていませんでした。`"a full name is present on the card"` という文に変えたら一致します。シャドー評価がシャドー評価自身の欠陥を見つけた形で、いちばん安く済む見つかり方です。

`verified` は全実行で 0 でした。「do not use」の文言をそのまま評価器に渡している効果が出ています。ここが 0 から動いたら、それはカードではなく質問の側の異常です。

### Mutual Value の claim_type 二重評価

GIVE / GET の各項目を `noul` で「fact か」と聞きます。生成器が付けた `claim_type` は state に入れません。

合成ケース3項目、3回とも安定:

| 項目                                                 | 生成器のラベル | fact 確率      |
| ---------------------------------------------------- | -------------- | -------------- |
| give_1（ユーザー自身の Personal Context の言い換え） | fact           | **0.80〜0.81** |
| give_2（相手企業について何の根拠もなく断定）         | hypothesis     | **0.12**       |
| get_1（推測だが自然な期待）                          | hypothesis     | 0.22〜0.24     |

**根拠のある主張と根拠のない断定が 0.81 対 0.12 で分離しました。** ラベル一致も3項目すべてで取れています。1ケースでは結論できませんが、命題の立て方が機能していることは確認できました。

### レイテンシーの補足

上の 534〜723ms は1サンプルごとに別プロセスで、TLS ハンドシェイク込みの「1発目」です。同一プロセス内で続けて呼ぶと **208〜515ms** まで下がります（ペイロードが小さいものほど速く、identity と claims は 208〜270ms）。本番のようにコネクションを張り続けられる経路なら後者に近づきます。

### 本番接続の判断に使うとき

Fast Path の予算は `flash_brief` 14,000ms、エンドツーエンド目標は P50 5秒 / P90 10秒です。約600msの追加はその枠内に収まりますが無料ではないので、接続するなら非同期か feature flag 配下にしてください（ADR-0005）。

## 片付け

```bash
pnpm supabase:stop
```

生画像は抽出成功直後に削除されます。失敗して残った場合は掃除エンドポイントを叩けます。

```bash
curl -s -X POST http://127.0.0.1:3000/api/internal/cleanup-expired-scans -H "x-cleanup-secret: $CLEANUP_SECRET"
```
