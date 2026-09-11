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

## 片付け

```bash
pnpm supabase:stop
```

生画像は抽出成功直後に削除されます。失敗して残った場合は掃除エンドポイントを叩けます。

```bash
curl -s -X POST http://127.0.0.1:3000/api/internal/cleanup-expired-scans -H "x-cleanup-secret: $CLEANUP_SECRET"
```
