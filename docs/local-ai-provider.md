# ローカル／OpenAI互換プロバイダーで動かす

`AI_PROVIDER_BASE_URL` を設定すると、5つのAIステージすべてが OpenAI ではなく
OpenAI互換サーバーを向きます。未設定なら従来どおり OpenAI です。

各ステージのモデルは個別に指定できるので、抽出だけローカル、生成は OpenAI と
いった混在はできません（向け先は1つ）。混在を試す場合は、ステージ単位で環境を
分けて2回計測してください。

## 起動例

Ollama（`/v1/responses` は v0.13.3 以降）:

```bash
ollama serve
```

```bash
ollama pull gemma4:12b
```

vLLM（`/v1/responses` をフル実装）:

```bash
vllm serve google/gemma-4-12B-it --port 8000
```

## 設定

`apps/api/.env.local`:

```
AI_PROVIDER_BASE_URL=http://127.0.0.1:11434/v1
AI_CARD_EXTRACTION_MODEL=gemma4:12b
AI_PERSONAL_CONTEXT_MODEL=gemma4:12b
AI_COMPANY_CONTEXT_MODEL=gemma4:12b
AI_FLASH_BRIEF_MODEL=gemma4:12b
AI_MUTUAL_VALUE_MODEL=gemma4:12b
OPENAI_API_KEY=unused-locally
```

`OPENAI_API_KEY` は空にできません（設定の欠落と区別するため）。ローカル運用では
任意のダミー値を入れてください。

`AI_COMPANY_WEB_SEARCH=on` との併用は起動時エラーになります。ホスト型の
検索ツールを持たないサーバーでは全スキャンがプロバイダー障害として失敗するうえ、
データを自前のサーバーに留めるつもりの構成が外部検索を始めるのは意図と逆だからです。
ローカル運用では会社の公開情報調査は使えません。

不正な URL や `http`/`https` 以外のスキームは起動時エラーになります。OpenAI へ
黙って戻すと、ローカル推論を設定したつもりの環境が名刺画像を第三者に送ることに
なるためです。

## 未検証の点

- **日本語名刺の抽出精度** — Gemma 4 は DocVQA / InfoVQA が強い一方、日本語名刺の
  項目割当（氏名・会社・部署・役職）の精度は未測定です。8項目の一致率で測る
  ラベル付きセットは `packages/test-fixtures/src/card-text-fixtures.ts` にあります
- **コスト** — ローカル推論は API 課金が消える代わりに、常時起動する計算資源が
  必要です。少量ならホスティング費が API 費を上回る可能性があります

## 実測で分かっていること（2026-09-10）

- **strict な JSON スキーマは効く。** Ollama 0.33.3 の `/v1/responses` は
  `text.format` の strict な json_schema を honor し、スキーマ準拠のJSONを返しました。
  各ステージのコードを Chat Completions に書き換える必要はありません
- **CPU実行では実測が成立しない。** GPU に載らない環境（`ollama ps` の
  `size_vram` が 0）では、`gemma4:12b` が抽出スキーマ（8項目＋8確信度＋language の
  17プロパティ）1ケースに **7分23秒** かかりました。スキーマなしの短い応答は15秒なので、
  支配的なのはモデルサイズではなく**制約デコードの重さ**です。`qwen3.5:9b` は
  240秒の予算でも1ケース目に届きませんでした
- したがって 20 ケースのローカル実測には GPU が必要です。CPU 環境で試すなら、
  ケースあたり予算を `AI_CARD_FIELD_EVAL_TIMEOUT_MS` で大きく取り、所要時間を
  ケース数×予算で見積もってください

## 名刺画像の扱い

ローカルサーバーに向けた場合、名刺の生画像は外部に出ません。プライバシー面の
利点はここで、`docs/exec-plans/` の削除・保持要件と組み合わせて評価してください。
