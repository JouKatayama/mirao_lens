import {
  opportunityPlaybookEntrySchema,
  type OpportunityPlaybookEntry,
} from "@miraio/domain";

// Manufacturing Opportunity Playbook v0.1 (ML-029).
//
// Written from publicly known, generalized manufacturing knowledge only: no
// employer design data, customer information or internal material. Each entry
// is a question worth asking a role, not a claim about any company. Sales
// reps review these in the pilot before any entry is treated as validated.

const entries = [
  // ─── Visual inspection ─────────────────────────────────────────────────────
  {
    id: "manufacturing-visual-inspection-001",
    theme: "visual_inspection",
    target_departments: ["品質保証", "生産技術", "工場長"],
    target_signals: [
      "品質",
      "検査",
      "生産技術",
      "工場長",
      "quality",
      "inspection",
    ],
    offering_signals: [
      "外観検査",
      "画像解析",
      "画像認識",
      "検査AI",
      "inspection",
      "vision",
    ],
    problem_hypothesis: "目視検査の工数や判定のばらつきが残っている",
    verification_dimensions: [
      "人が判定している工程",
      "判定基準の明文化",
      "検査員の人数",
    ],
    suggested_question: "現在、品質検査で人が判断している工程はありますか？",
    potential_offerings: ["外観検査の自動化", "判定基準の標準化"],
    suggested_next_action: "対象工程を1つに絞った検査サンプルの確認を提案する",
  },
  {
    id: "manufacturing-visual-inspection-002",
    theme: "visual_inspection",
    target_departments: ["品質保証", "品質管理"],
    target_signals: ["品質", "検査", "quality"],
    offering_signals: ["外観検査", "画像解析", "検査AI", "異常検知", "vision"],
    problem_hypothesis:
      "検査員ごとに良否判定が揺れ、過検出や見逃しが起きている",
    verification_dimensions: [
      "判定の個人差",
      "限度見本の有無",
      "流出不良の発生状況",
    ],
    suggested_question:
      "良品・不良品の判定基準は、検査員の間でどの程度そろっていますか？",
    potential_offerings: ["判定の定量化", "限度見本のデータ化"],
    suggested_next_action:
      "判定が分かれやすい不良種を1つ選び、画像の共有可否を確認する",
  },
  {
    id: "manufacturing-visual-inspection-003",
    theme: "visual_inspection",
    target_departments: ["生産技術", "設備技術"],
    target_signals: ["生産技術", "設備技術", "自動化", "engineering"],
    offering_signals: ["外観検査", "画像解析", "自動化", "ロボット", "vision"],
    problem_hypothesis:
      "検査自動化を試したが、品種切替や照明条件で定着していない",
    verification_dimensions: [
      "過去の自動化の試行",
      "品種数と切替頻度",
      "撮像条件",
    ],
    suggested_question:
      "これまでに検査の自動化を試されたことはありますか？そのとき何が壁になりましたか？",
    potential_offerings: ["少量データでの検査モデル", "撮像条件の設計支援"],
    suggested_next_action: "過去の試行内容を伺う技術ヒアリングを提案する",
  },
  {
    id: "manufacturing-visual-inspection-004",
    theme: "visual_inspection",
    target_departments: ["工場長", "製造部"],
    target_signals: ["工場長", "製造部", "製造課", "plant manager"],
    offering_signals: ["外観検査", "省人化", "検査AI", "自動化"],
    problem_hypothesis: "検査工程の人員確保が難しくなっている",
    verification_dimensions: [
      "検査工程の人員数",
      "採用・定着状況",
      "夜勤の有無",
    ],
    suggested_question:
      "検査工程の人員は、今後も同じ体制で確保できそうですか？",
    potential_offerings: ["検査工程の省人化", "検査員の負荷軽減"],
    suggested_next_action: "人手のかかっている検査工程の見学可否を確認する",
  },
  // ─── Equipment maintenance ─────────────────────────────────────────────────
  {
    id: "manufacturing-equipment-downtime-001",
    theme: "equipment_maintenance",
    target_departments: ["生産技術", "設備保全"],
    target_signals: ["保全", "設備", "生産技術", "maintenance"],
    offering_signals: [
      "予知保全",
      "予兆検知",
      "設備データ",
      "IoT",
      "異常検知",
      "maintenance",
    ],
    problem_hypothesis: "設備停止や稼働率低下の要因が十分に把握できていない",
    verification_dimensions: [
      "停止要因の記録方法",
      "データ取得状況",
      "改善目標",
    ],
    suggested_question:
      "設備停止の要因を、現在どのように記録・分析していますか？",
    potential_offerings: ["設備データ分析", "予兆検知", "保全最適化"],
    suggested_next_action: "対象設備を絞った技術ヒアリングを提案する",
  },
  {
    id: "manufacturing-equipment-maintenance-002",
    theme: "equipment_maintenance",
    target_departments: ["設備保全", "保全課"],
    target_signals: ["保全", "設備管理", "maintenance", "工場長"],
    offering_signals: [
      "予知保全",
      "予兆検知",
      "IoT",
      "センサー",
      "maintenance",
    ],
    problem_hypothesis:
      "時間基準の保全が中心で、突発停止の予兆を捉えきれていない",
    verification_dimensions: [
      "保全方式（時間基準/状態基準）",
      "突発停止の頻度",
      "センサーの設置状況",
    ],
    suggested_question:
      "突発的な設備停止を、事前に把握する仕組みはありますか？",
    potential_offerings: ["状態基準保全への移行支援", "振動・電流データの活用"],
    suggested_next_action:
      "停止影響の大きい設備を1台選び、データ取得状況を確認する",
  },
  {
    id: "manufacturing-equipment-maintenance-003",
    theme: "equipment_maintenance",
    target_departments: ["設備保全", "工場長"],
    target_signals: ["保全", "工場長", "設備"],
    offering_signals: [
      "技能伝承",
      "ナレッジ",
      "保全記録",
      "AIエージェント",
      "生成AI",
    ],
    problem_hypothesis: "保全ノウハウが熟練者に偏り、引き継ぎが難しい",
    verification_dimensions: [
      "熟練者への依存度",
      "保全記録の形式",
      "引き継ぎの方法",
    ],
    suggested_question:
      "設備トラブルの対応ノウハウは、どのような形で引き継がれていますか？",
    potential_offerings: ["保全記録の構造化", "対応手順の検索・提示"],
    suggested_next_action:
      "保全記録のサンプル形式（紙・Excel・システム）を確認する",
  },
  {
    id: "manufacturing-equipment-maintenance-004",
    theme: "equipment_maintenance",
    target_departments: ["設備保全", "購買", "生産技術"],
    target_signals: ["保全", "設備", "購買"],
    offering_signals: ["予知保全", "保全計画", "部品管理", "在庫"],
    problem_hypothesis: "保全部品の在庫と交換時期の最適化が難しい",
    verification_dimensions: [
      "予備品の管理方法",
      "交換周期の決め方",
      "欠品による停止の有無",
    ],
    suggested_question:
      "保全用の予備部品は、どのような基準で在庫や交換時期を決めていますか？",
    potential_offerings: ["交換時期の予測", "予備品在庫の適正化"],
    suggested_next_action: "交換頻度の高い部品を例に現状の運用を伺う",
  },
  // ─── Manufacturing data ────────────────────────────────────────────────────
  {
    id: "manufacturing-data-integration-001",
    theme: "manufacturing_data",
    target_departments: ["生産管理", "情報システム", "DX推進"],
    target_signals: ["生産管理", "情報システム", "情シス", "DX"],
    offering_signals: [
      "データ連携",
      "データ基盤",
      "MES",
      "ERP",
      "IoT",
      "データ統合",
    ],
    problem_hypothesis: "装置・MES・ERP間のデータが分断されている",
    verification_dimensions: [
      "接続済みのシステム",
      "手作業の転記",
      "データの粒度",
    ],
    suggested_question:
      "設備データと生産管理データは、どこまで連携できていますか？",
    potential_offerings: ["システム間連携", "製造データ基盤"],
    suggested_next_action: "現在のシステム構成図の共有可否を確認する",
  },
  {
    id: "manufacturing-data-integration-002",
    theme: "manufacturing_data",
    target_departments: ["製造部", "生産管理"],
    target_signals: ["製造", "生産管理", "現場"],
    offering_signals: [
      "ペーパーレス",
      "データ収集",
      "日報",
      "タブレット",
      "IoT",
    ],
    problem_hypothesis: "現場の記録が紙やExcel中心で、集計に時間がかかる",
    verification_dimensions: ["記録媒体", "集計にかかる時間", "記録の活用先"],
    suggested_question:
      "現場の作業記録や日報は、どのような形で集めて活用されていますか？",
    potential_offerings: ["現場記録のデジタル化", "集計の自動化"],
    suggested_next_action: "集計に最も時間がかかっている帳票を伺う",
  },
  {
    id: "manufacturing-data-integration-003",
    theme: "manufacturing_data",
    target_departments: ["DX推進", "経営企画"],
    target_signals: ["DX", "経営企画", "デジタル", "digital"],
    offering_signals: [
      "データ基盤",
      "可視化",
      "BI",
      "ダッシュボード",
      "データ分析",
    ],
    problem_hypothesis:
      "データは集めているが、意思決定に使える形になっていない",
    verification_dimensions: ["見ている指標", "更新頻度", "データの所在"],
    suggested_question:
      "工場の状況は、どの指標をどれくらいの頻度で確認されていますか？",
    potential_offerings: ["指標の可視化", "工場横断のデータ整備"],
    suggested_next_action:
      "重視している指標を1〜2個伺い、現状の集計方法を確認する",
  },
  {
    id: "manufacturing-data-integration-004",
    theme: "manufacturing_data",
    target_departments: ["生産技術", "情報システム"],
    target_signals: ["生産技術", "情報システム", "情シス", "設備"],
    offering_signals: ["IoT", "エッジ", "PLC", "データ収集"],
    problem_hypothesis: "古い設備やPLCからのデータ取得が難しい",
    verification_dimensions: [
      "設備の年代・メーカー",
      "通信方式",
      "セキュリティ方針",
    ],
    suggested_question:
      "古い設備からのデータ取得で、苦労されている点はありますか？",
    potential_offerings: ["後付けセンサー", "エッジでのデータ収集"],
    suggested_next_action: "データ取得を優先したい設備の種類を確認する",
  },
  // ─── Production planning ───────────────────────────────────────────────────
  {
    id: "manufacturing-production-planning-001",
    theme: "production_planning",
    target_departments: ["生産管理", "生産計画"],
    target_signals: ["生産管理", "生産計画", "planning"],
    offering_signals: ["生産計画", "スケジューリング", "最適化", "AI計画"],
    problem_hypothesis: "計画変更時の調整が担当者の経験に依存している",
    verification_dimensions: ["計画の作成方法", "変更の頻度", "判断基準"],
    suggested_question: "計画変更時の調整は、何を基準に判断されていますか？",
    potential_offerings: ["生産スケジューリング", "計画立案の標準化"],
    suggested_next_action: "直近の計画変更の事例を伺うヒアリングを提案する",
  },
  {
    id: "manufacturing-production-planning-002",
    theme: "production_planning",
    target_departments: ["生産管理", "営業管理"],
    target_signals: ["生産管理", "需給", "SCM", "営業管理"],
    offering_signals: ["需要予測", "在庫最適化", "SCM", "生産計画"],
    problem_hypothesis:
      "需要変動と在庫・納期のバランス調整に負荷がかかっている",
    verification_dimensions: [
      "需要予測の方法",
      "在庫水準の決め方",
      "納期遅延の発生状況",
    ],
    suggested_question:
      "需要の変動に対して、在庫と納期のバランスはどのように調整されていますか？",
    potential_offerings: ["需要予測", "在庫水準の最適化"],
    suggested_next_action: "変動の大きい品目を例に現在の運用を伺う",
  },
  {
    id: "manufacturing-production-planning-003",
    theme: "production_planning",
    target_departments: ["生産管理", "工場長"],
    target_signals: ["生産管理", "工場長", "生産計画"],
    offering_signals: [
      "生産計画",
      "属人化",
      "スケジューリング",
      "AIエージェント",
    ],
    problem_hypothesis: "計画作成が特定の担当者に集中している",
    verification_dimensions: [
      "計画作成者の人数",
      "作成にかかる時間",
      "不在時の対応",
    ],
    suggested_question:
      "生産計画の作成は、何名くらいの方で担当されていますか？",
    potential_offerings: ["計画作成の支援・自動化", "ノウハウの形式知化"],
    suggested_next_action: "計画作成の流れを1日分伺う機会を提案する",
  },
  // ─── Equipment software ────────────────────────────────────────────────────
  {
    id: "manufacturing-equipment-software-001",
    theme: "equipment_software",
    target_departments: ["装置開発", "制御設計", "ソフトウェア開発"],
    target_signals: ["装置", "制御", "ソフトウェア", "組込", "software"],
    offering_signals: [
      "テスト自動化",
      "ソフトウェア",
      "組込",
      "開発支援",
      "シミュレーション",
    ],
    problem_hypothesis:
      "装置やシステムの変更時に、確認・テスト工数が膨らんでいる",
    verification_dimensions: ["変更の頻度", "テストの方法", "工数のかかる工程"],
    suggested_question:
      "装置やシステムの変更時、最も工数がかかるのはどの工程ですか？",
    potential_offerings: ["テスト自動化", "変更影響の分析"],
    suggested_next_action: "直近の変更案件を例に工程ごとの工数を伺う",
  },
  {
    id: "manufacturing-equipment-software-002",
    theme: "equipment_software",
    target_departments: ["装置開発", "制御設計"],
    target_signals: ["装置", "制御", "設計"],
    offering_signals: ["シミュレーション", "デジタルツイン", "仮想試運転"],
    problem_hypothesis: "実機がないと検証できず、立ち上げ期間が長くなっている",
    verification_dimensions: [
      "実機検証の期間",
      "シミュレーションの利用状況",
      "現地調整の工数",
    ],
    suggested_question:
      "装置の立ち上げで、実機がないと確認できない作業はどのくらいありますか？",
    potential_offerings: ["仮想試運転", "シミュレーション環境"],
    suggested_next_action: "立ち上げ期間の内訳を伺う技術相談を提案する",
  },
  {
    id: "manufacturing-equipment-software-003",
    theme: "equipment_software",
    target_departments: [
      "装置開発",
      "カスタマーサポート",
      "フィールドエンジニア",
    ],
    target_signals: ["装置", "サポート", "サービス", "フィールド", "service"],
    offering_signals: ["リモート監視", "ログ解析", "保守", "AIエージェント"],
    problem_hypothesis:
      "納入先での装置トラブル対応に、ログ収集や切り分けの時間がかかっている",
    verification_dimensions: [
      "トラブル時の情報収集方法",
      "切り分けの手順",
      "現地対応の頻度",
    ],
    suggested_question:
      "納入先で装置トラブルが起きた際、原因の切り分けはどのように進めていますか？",
    potential_offerings: ["ログの自動収集・解析", "リモートでの一次切り分け"],
    suggested_next_action: "よくある問い合わせの種類を伺う",
  },
  // ─── Quality assurance ─────────────────────────────────────────────────────
  {
    id: "manufacturing-quality-traceability-001",
    theme: "quality_assurance",
    target_departments: ["品質保証", "品質管理"],
    target_signals: ["品質保証", "品質管理", "quality"],
    offering_signals: [
      "トレーサビリティ",
      "ロット管理",
      "データ連携",
      "品質データ",
    ],
    problem_hypothesis:
      "不良発生時に、ロットや工程条件をさかのぼるのに時間がかかる",
    verification_dimensions: [
      "遡及に必要な情報",
      "記録の所在",
      "調査にかかる時間",
    ],
    suggested_question:
      "不良が見つかったとき、原因となった工程や条件をさかのぼるのにどのくらいかかりますか？",
    potential_offerings: ["トレーサビリティ構築", "品質データの紐づけ"],
    suggested_next_action: "直近の品質調査の流れを伺う",
  },
  {
    id: "manufacturing-quality-analysis-002",
    theme: "quality_assurance",
    target_departments: ["品質保証", "生産技術"],
    target_signals: ["品質", "生産技術", "歩留"],
    offering_signals: ["データ分析", "要因分析", "歩留改善", "機械学習", "AI"],
    problem_hypothesis:
      "歩留まりや品質ばらつきの要因分析が経験頼みになっている",
    verification_dimensions: [
      "歩留まりの把握方法",
      "分析に使うデータ",
      "改善の進め方",
    ],
    suggested_question:
      "品質のばらつきや歩留まりの要因は、どのようなデータで分析されていますか？",
    potential_offerings: ["品質要因分析", "工程条件の最適化"],
    suggested_next_action: "改善テーマになっている品目を1つ伺う",
  },
  {
    id: "manufacturing-quality-documentation-003",
    theme: "quality_assurance",
    target_departments: ["品質保証"],
    target_signals: ["品質保証", "ISO", "監査"],
    offering_signals: ["文書管理", "生成AI", "AIエージェント", "業務効率化"],
    problem_hypothesis: "品質記録や顧客向け報告書の作成に工数がかかっている",
    verification_dimensions: [
      "作成している文書の種類",
      "作成時間",
      "顧客からの要求",
    ],
    suggested_question:
      "品質関連の報告書や記録の作成で、特に時間がかかっているものはありますか？",
    potential_offerings: ["報告書作成の効率化", "記録の検索性向上"],
    suggested_next_action: "工数の大きい文書を1種類伺う",
  },
  // ─── Factory DX ────────────────────────────────────────────────────────────
  {
    id: "manufacturing-factory-dx-001",
    theme: "factory_dx",
    target_departments: ["DX推進", "経営企画", "情報システム"],
    target_signals: ["DX", "デジタル", "経営企画", "情報システム", "digital"],
    offering_signals: ["DX", "AI", "AIエージェント", "生成AI", "業務改善"],
    problem_hypothesis: "DXのPoCは進んでいるが、現場への展開が止まっている",
    verification_dimensions: [
      "実施中のPoC",
      "展開の判断基準",
      "現場部門との体制",
    ],
    suggested_question:
      "これまでのDXの取り組みで、現場まで定着したものと止まったものの違いは何でしたか？",
    potential_offerings: ["現場展開の伴走", "効果測定の設計"],
    suggested_next_action: "展開を検討中のテーマを伺う",
  },
  {
    id: "manufacturing-factory-dx-002",
    theme: "factory_dx",
    target_departments: ["工場長", "製造部"],
    target_signals: ["工場長", "製造部", "工場"],
    offering_signals: ["省人化", "自動化", "ロボット", "AI", "業務改善"],
    problem_hypothesis:
      "人手不足の中で、どの工程から省人化すべきか判断しかねている",
    verification_dimensions: [
      "人手の多い工程",
      "省人化の優先順位",
      "投資判断の基準",
    ],
    suggested_question: "人手不足の影響が一番大きいのは、どの工程ですか？",
    potential_offerings: ["工程別の省人化診断", "優先順位づけ"],
    suggested_next_action: "工程見学または工程一覧の共有を提案する",
  },
  {
    id: "manufacturing-factory-dx-003",
    theme: "factory_dx",
    target_departments: ["情報システム", "DX推進"],
    target_signals: ["情報システム", "情シス", "DX", "セキュリティ"],
    offering_signals: [
      "生成AI",
      "AIエージェント",
      "クラウド",
      "セキュリティ",
      "オンプレミス",
    ],
    problem_hypothesis: "生成AIの活用に、情報管理やセキュリティ上の条件がある",
    verification_dimensions: [
      "社内ルールの有無",
      "利用可能な環境",
      "審査の流れ",
    ],
    suggested_question:
      "生成AIを業務で使う場合、社内ではどのような条件や審査がありますか？",
    potential_offerings: [
      "閉域・オンプレミスでのAI活用",
      "利用ルールに沿った導入",
    ],
    suggested_next_action: "導入審査の流れと必要資料を確認する",
  },
] satisfies readonly Omit<
  OpportunityPlaybookEntry,
  "fact_status" | "industry" | "provenance"
>[];

export const manufacturingOpportunityPlaybook: readonly OpportunityPlaybookEntry[] =
  Object.freeze(
    entries.map((entry) =>
      opportunityPlaybookEntrySchema.parse({
        ...entry,
        fact_status: "hypothesis",
        industry: "manufacturing",
        provenance: "generalized_industry_knowledge",
      }),
    ),
  );
