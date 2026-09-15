# Miraio Lens アーキテクチャ・データベース概要

- 対象: MVP / ローカルパイロット
- 更新日: 2026-09-16
- 詳細設計: [`ARCHITECTURE.md`](../ARCHITECTURE.md)

## 1. 全体像

Miraio Lens は、MVPの変更しやすさと運用の軽さを優先した
**モジュラーモノリス + 非同期AIパイプライン**です。

```mermaid
flowchart LR
  User[利用者] --> Mobile[Expo / React Native<br/>PC Web・将来スマホ]
  Mobile -->|Supabase Auth| Auth[Supabase Auth]
  Mobile -->|Bearer Token付きHTTPS| API[Next.js API / BFF]

  API --> Domain[Domain<br/>業務ルール・型]
  API --> DBAdapter[DB Adapter]
  API --> AIAdapter[AI Adapter]

  DBAdapter --> Postgres[(Supabase PostgreSQL)]
  DBAdapter --> Storage[(Supabase Storage<br/>非公開名刺画像)]
  AIAdapter --> OpenAI[OpenAI API]

  Auth --> Postgres
  Postgres -->|RLS: 利用者単位| API
```

### 主な役割

| レイヤー     | 技術                                | 役割                                     |
| ------------ | ----------------------------------- | ---------------------------------------- |
| クライアント | Expo / React Native                 | ログイン、名刺撮影、確認、結果表示、履歴 |
| API / BFF    | Next.js Route Handlers              | 認証確認、処理の進行、AI・DBの呼び出し   |
| 認証         | Supabase Auth                       | メールOTP、ローカル試用時のゲスト認証    |
| データベース | Supabase PostgreSQL                 | 利用者、名刺、分析、次の行動などの永続化 |
| 画像保管     | Supabase Storage                    | 読み取り中の名刺画像を非公開で一時保管   |
| AI           | OpenAI API（差し替え可能なAdapter） | 名刺抽出、企業情報整理、提案生成         |

OpenAI固有の処理は `packages/ai` に閉じ込め、業務上のデータ型は
`packages/domain` に置いています。そのため、将来モデルやAI提供元を変更しても、
アプリ全体を作り直さずに済む構成です。

## 2. 名刺から提案までの流れ

一度の巨大なAI処理にはせず、失敗箇所を特定・再実行しやすい段階処理にしています。

```mermaid
flowchart TD
  A[ログイン / ゲスト開始] --> B[自分の経歴・強みを登録]
  B --> C[名刺を撮影]
  C --> D[非公開Storageへ一時保存]
  D --> E[Card Intelligence<br/>氏名・会社・役職等を構造化]
  E --> F[利用者が読取結果を確認・訂正]
  F --> G[Company Context<br/>企業情報を整理]
  G --> H[Flash Brief<br/>会話の要点・質問を生成]
  H --> I[Mutual Value<br/>双方の価値を整理]
  I --> J[Next Action<br/>次の一手を保存]
  J --> K[会話メモ・履歴]

  E -.根拠と確度.-> Evidence[Evidence]
  G -.根拠と確度.-> Evidence
  H -.事実と推測を区別.-> Evidence
```

処理状況は `scans.status`、各AI実行は `ai_runs` に記録します。これにより、
途中で失敗しても最初からやり直さず、対象ステージを安全に再試行できます。

## 3. データベース構成

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : owns
  AUTH_USERS ||--o{ PERSONAL_CONTEXT_ITEMS : owns
  AUTH_USERS ||--o{ SCANS : owns
  AUTH_USERS ||--o{ PEOPLE : owns
  AUTH_USERS ||--o{ ORGANIZATIONS : owns

  SCANS ||--o| BUSINESS_CARDS : produces
  SCANS ||--o{ EVIDENCE : has
  SCANS ||--o| RELATIONSHIP_ANALYSES : has
  SCANS ||--o| INTERACTION_NOTES : has
  SCANS ||--o{ NEXT_ACTIONS : has
  SCANS ||--o{ AI_RUNS : tracks

  PEOPLE o|--o{ BUSINESS_CARDS : identifies
  ORGANIZATIONS o|--o{ BUSINESS_CARDS : belongs_to

  AUTH_USERS {
    uuid id PK
  }
  PROFILES {
    uuid id PK
    uuid user_id FK
    text display_name
    text current_company
    text current_role
  }
  PERSONAL_CONTEXT_ITEMS {
    uuid id PK
    uuid user_id FK
    text type
    text text
    text_array tags
    vector embedding
    boolean user_approved
  }
  SCANS {
    uuid id PK
    uuid user_id FK
    text status
    text meeting_goal
    boolean is_favorite
    text raw_image_path
    timestamptz raw_image_expires_at
  }
  BUSINESS_CARDS {
    uuid id PK
    uuid scan_id FK
    uuid user_id FK
    uuid person_id FK
    uuid organization_id FK
    text name
    text company
    text department
    text title
    text email
    text phone
    jsonb field_confidence
    jsonb extraction_json
  }
  PEOPLE {
    uuid id PK
    uuid owner_user_id FK
    text name
    text identity_status
  }
  ORGANIZATIONS {
    uuid id PK
    uuid owner_user_id FK
    text name
    text domain
    text industry
    text summary
  }
  EVIDENCE {
    uuid id PK
    uuid scan_id FK
    uuid user_id FK
    text source_type
    text source_url
    text excerpt
    float confidence
  }
  RELATIONSHIP_ANALYSES {
    uuid id PK
    uuid scan_id FK
    uuid user_id FK
    jsonb company_context_json
    jsonb flash_brief_json
    jsonb mutual_value_json
  }
  INTERACTION_NOTES {
    uuid id PK
    uuid scan_id FK
    uuid user_id FK
    text note_text
  }
  NEXT_ACTIONS {
    uuid id PK
    uuid scan_id FK
    uuid user_id FK
    text action_text
    text status
    timestamptz due_at
  }
  AI_RUNS {
    uuid id PK
    uuid scan_id FK
    uuid user_id FK
    text stage
    text provider
    text model_alias
    text status
    int latency_ms
  }
```

### テーブルの目的

| テーブル                 | 保存する内容                                 |
| ------------------------ | -------------------------------------------- |
| `profiles`               | 利用者の基本プロフィール                     |
| `personal_context_items` | 経歴、専門性、提供できる価値、探しているもの |
| `scans`                  | 1回の名刺交換とAI処理の進行状態              |
| `business_cards`         | 名刺から読み取った構造化データと確度         |
| `people`                 | 同一人物として整理した相手情報               |
| `organizations`          | 相手企業の整理済み情報                       |
| `evidence`               | 事実の根拠、出典、確度                       |
| `relationship_analyses`  | 企業情報、Flash Brief、Mutual Value          |
| `interaction_notes`      | 面談・会話メモ                               |
| `next_actions`           | 次の行動、状態、期限                         |
| `ai_runs`                | AI処理のステージ、成功・失敗、処理時間       |

## 4. セキュリティとプライバシー

- すべての利用者データにSupabase AuthのユーザーIDを紐づけています。
- PostgreSQLのRow Level Security（RLS）により、本人の行だけを読み書きできます。
- ゲスト利用者にも固有のAuth UUIDが発行され、他のゲストとは分離されます。
- 名刺画像のStorageは非公開で、ユーザーID別フォルダへ保存します。
- 名刺画像は読み取り完了後に削除を試み、保持が必要な場合にも有効期限を設定します。
- OpenAI APIキーやSupabaseの特権キーはサーバー側だけに置き、アプリへ含めません。
- API・通常ログへ名刺画像や個人情報を不用意に出さない設計です。
- アカウント削除時は、外部キーのcascadeにより利用者データをまとめて削除します。

## 5. リポジトリ構成

```text
apps/
  mobile/          Expo / React Native UI
  api/             Next.js API / BFF
packages/
  domain/          AIやDBに依存しない業務モデル
  ai/              AIプロバイダー・段階処理・出力スキーマ
  db/              Supabaseへの保存・取得Adapter
  shared/          汎用ユーティリティ
  ui-tokens/       色・余白などのUIトークン
  test-fixtures/   個人情報を含まないテストデータ
supabase/
  migrations/      DBスキーマ・RLS・DB関数
  tests/           RLSなどのDBテスト
docs/               仕様、設計判断、実行計画
evals/              AI品質評価データ
```

## 6. 現在地と今後

現在はローカルPCで試用できるMVPです。モバイルUIもExpo / React Nativeで
構築しているため、同じ業務ロジックを使ってスマホ提供へ進められます。

本番公開前には、クラウド環境へのデプロイ、監視、バックアップ、API利用上限、
公開ゲスト利用の不正対策、プライバシーポリシー等を別途整備します。
