# 実機受け入れテスト手順（ML-003 / ML-004 / ML-005）

`docs/exec-plans/active/` の3チケットは実装が完了し、**実機でしか確認できない項目だけが未完**です。このドキュメントはその残り4項目を1回の通し操作で消化するための手順です。

未完の項目は次の4つです。

| チケット | 未完のチェック項目                                                             |
| -------- | ------------------------------------------------------------------------------ |
| ML-003   | ハッピーパスが実機で3分以内に完了する                                          |
| ML-003   | 実サーバーAIアダプタがスキーマ妥当な構造化提案を返す（本番経路をモックしない） |
| ML-004   | 実機のカメラ許可・フレーミング・撮り直し・アップロードの受け入れ               |
| ML-005   | 実プロバイダー抽出と実機でのカード確認                                         |

実プロバイダーを通す部分は `docs/live-provider-smoke.md` と重なります。あちらは curl でパイプラインを通す手順、こちらは**同じ経路を実機のUIから通す**手順です。

## データの規則

**実在の人物の名刺は使いません。** AGENTS.md の規則であり、実プロバイダーに送信する以上は形式論ではありません。

撮影対象には `packages/test-fixtures/assets/synthetic-card-ja.png`（架空の会社・氏名、ドメインは `.invalid`）を使ってください。PCの画面に等倍で表示して撮影するか、紙に印刷します。Personal Context に入れる内容も架空の職歴にします。

テスト後はアプリからスキャンまたはアカウントを削除してください。

## 1. 事前準備（PC側）

Docker Desktop を起動してから、ローカル Supabase を立てます。

```bash
pnpm supabase:start
pnpm db:reset
```

環境ファイルを作ります。

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local
```

`apps/api/.env.local` に `pnpm supabase:start` が表示した URL と鍵、`OPENAI_API_KEY`、そして全ての `AI_*_MODEL` を入れます。**モデル変数が1つでも空だと該当ステージが起動時エラーになります。** ML-003 は `AI_PERSONAL_CONTEXT_MODEL`、ML-005 は `AI_CARD_EXTRACTION_MODEL` を使います。

## 2. 実機から届く場所にサーバーを置く

ここが実機テスト特有の唯一の落とし穴です。`.env.example` の `127.0.0.1` は**実機にとっては実機自身**を指すので、そのままでは何も繋がりません。

開発PCの LAN アドレスを調べます。

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' }).IPAddress
```

`apps/mobile/.env.local` の2つの URL のホスト部分をそのアドレスに置き換えます（`apps/api/.env.local` は**変えません**。API から見た Supabase は同じPC上なので `127.0.0.1` のままが正しい）。

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:3000
EXPO_PUBLIC_SUPABASE_URL=http://192.168.x.x:56321
```

実機と開発PCを**同じ Wi-Fi**に繋ぎます。Windows のファイアウォールが 3000 / 56321 を塞いでいると接続できないので、初回はプライベートネットワークでの許可ダイアログを通してください。

API とモバイルを別ターミナルで起動します。

```bash
pnpm dev:api
```

```bash
pnpm dev:mobile
```

実機から疎通を確認します。**実機のブラウザで `http://192.168.x.x:3000/api/health` を開き、`{"status":"ok"}` が見えること。** ここが見えないまま先に進むと、後の失敗が全部ネットワーク起因なのかアプリ起因なのか切り分けられません。

API が localhost にしか bind していない場合は次で開けます。

```bash
pnpm --filter @miraio/api exec next dev -H 0.0.0.0
```

### アプリの入れ方

まず `pnpm dev:mobile` が出す QR を Expo Go で読む方法を試してください。カメラ許可のダイアログ文言（`app.json` の `expo-camera` プラグインで定義）と通知の挙動が Expo Go で再現しない場合は、開発ビルドを作ります。

```bash
pnpm --filter @miraio/mobile exec expo run:android
```

**ML-004 の受け入れ項目は「OS の許可ダイアログがいつ出るか」なので、ダイアログ文言が自前のものでないと判定になりません。** Expo Go で文言が違った時点で開発ビルドに切り替えてください。

## 3. ML-003 オンボーディング（実機・3分計測）

サインインは2通りあります。OTP メールはローカルでは `http://127.0.0.1:56324` に届くので、実機テスト中はPC側でコードを拾うことになります。手数を減らすなら `apps/mobile/.env.local` に `EXPO_PUBLIC_ENABLE_GUEST_LOGIN=1` を入れてゲスト入場を使ってください（ローカル Supabase は匿名サインインを許可しています）。

**ストップウォッチを開始してから**次を行います。

1. サインインする
2. フォームを日本語で埋める（架空の職歴）
3. AI提案が**未承認として**表示されることを確認する
4. 1件を編集し、1件を削除し、残りを承認する
5. My Context を開き、**承認済みだけが**並んでいることを確認する
6. ここで計測終了。**3分以内かを記録する**
7. アプリを再起動し、承認済みコンテキストが再読込されることを確認する
8. 承認済みの1件を編集し、1件を削除する

AI提案が返ってきた時点で「実サーバーAIアダプタがスキーマ妥当な構造化提案を返す」も満たされます。提案が出ずに `ai_unconfigured` が出たら、`AI_PERSONAL_CONTEXT_MODEL` か `OPENAI_API_KEY` が空です。

### ユーザー間の分離を確認する

別アカウントでサインインし、1人目のコンテキストが**一切見えない**ことを確認します。ゲスト入場を使っている場合はアプリのデータを消して再度ゲストで入れば別ユーザーになります。

## 4. ML-004 カメラ撮影（実機）

**ここは一度しか正しく測れません。** アプリを一度もカメラ許可していない状態から始めてください。既に許可済みなら、OS設定でアプリの権限をリセットしてからにします。

1. 会う目的を選び、撮影を開く
2. **カメラを許可** を押すまで OS の許可ダイアログが出ないことを確認する（起動時に出たら不合格）
3. 一度 **拒否** し、再試行または設定への導線が出ることを確認する
4. 許可し、合成名刺をフレーム内に合わせる
5. 撮影 → 撮り直し → 再撮影 → アップロード
6. アップロードが完了することを確認する

### DB側の確認

PC側で、スキャンが1件だけ作られ、非公開オブジェクトが1つだけできていることを見ます。

```bash
set -a && . apps/api/.env.local && set +a
curl -s "$SUPABASE_URL/rest/v1/scans?select=id,status,meeting_goal,raw_image_path,raw_image_expires_at&order=created_at.desc&limit=3" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python -m json.tool
```

見るもの：行が1件だけ増えていること、`status` が `extracting_card` を通ること、`raw_image_expires_at` に1時間後が入っていること、`raw_image_path` が自分の user id で始まること。

## 5. ML-005 カード抽出（実プロバイダー・実機）

ML-004 のアップロードがそのまま ML-005 の入力になるので、操作は続きです。

1. 抽出中の表示を経て、8項目が **FACT / 名刺** ラベル付きで表示されることを確認する
2. **合成名刺の内容と1項目ずつ突き合わせる。** 特に氏名（架空 花子）と部署（デジタル推進本部 データ基盤部）の切り分け
3. 1項目を編集し、1項目を空にして保存する
4. 保存後に再読込しても訂正が残っていることを確認する

### 生画像が消えたことを確認する

**抽出成功後、生の名刺画像は即時削除される契約です。** ここは実機からは見えないので必ずPC側で確認してください。

```bash
curl -s "$SUPABASE_URL/rest/v1/scans?select=id,status,raw_image_path&order=created_at.desc&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python -m json.tool
```

`status` が `card_ready` 以降で `raw_image_path` が `null` になっていれば合格です。`null` にならない場合は削除が走っていないので、ML-005 の不合格として記録してください。

### ステージごとの実測レイテンシ

```bash
curl -s "$SUPABASE_URL/rest/v1/ai_runs?select=stage,model_alias,latency_ms,status&order=created_at.asc" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python -m json.tool
```

`card_extraction` の予算は 20,000ms、`flash_brief` は 14,000ms です。超えていれば `packages/ai/src/provider-client.ts` の予算か `AI_*_EFFORT` を見直す材料になります。

## 6. 結果の記録

合格・不合格にかかわらず、各チケットの `## Acceptance criteria` のチェックボックスを更新し、`## Implementation evidence` に日付つきで実測値（3分計測の秒数、レイテンシ、使った端末とOSバージョン）を追記してください。**4項目すべてが合格したら、該当チケットを `docs/exec-plans/active/` から完了側へ移せます。**

不合格が出た場合、チェックボックスは未完のままにして、何がどう違ったかを evidence に書き残してください。チケットの文言そのものを書き換えて合格にしないでください。

## 範囲外

リマインダー通知（ML-018）、深い補強ステージ、公開Web調査は、この手順の対象ではありません。公開Web調査を実機で見たい場合は `apps/api/.env.local` で `AI_COMPANY_WEB_SEARCH=on` にしてから手順4をやり直します。合成名刺の会社は実在しないので、**正しい挙動は「何も出ない」** です。会社説明とURLが返ってきたらそれは捏造なので、その旨を記録してください。
