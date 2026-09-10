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

不正な URL や `http`/`https` 以外のスキームは起動時エラーになります。OpenAI へ
黙って戻すと、ローカル推論を設定したつもりの環境が名刺画像を第三者に送ることに
なるためです。

## 未検証の点

- **strict な JSON スキーマ対応** — 各ステージは `text.format` に strict な
  json_schema を渡します。サーバー側がこれを honor しない場合、出力が
  `invalid_output` になります。このコードは `invalid_output` を終端扱いにするので
  無限リトライにはなりませんが、スキャンは失敗します
- **日本語名刺の抽出精度** — Gemma 4 は DocVQA / InfoVQA が強い一方、日本語名刺の
  項目割当（氏名・会社・部署・役職）の精度は未測定です。8項目の一致率で比較する
  ラベル付きセットが必要です
- **コスト** — ローカル推論は API 課金が消える代わりに、常時起動する計算資源が
  必要です。少量ならホスティング費が API 費を上回る可能性があります

## 名刺画像の扱い

ローカルサーバーに向けた場合、名刺の生画像は外部に出ません。プライバシー面の
利点はここで、`docs/exec-plans/` の削除・保持要件と組み合わせて評価してください。
