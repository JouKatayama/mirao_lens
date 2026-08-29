import type { MutualValueInput } from "@miraio/domain";

export type MutualValueCase = Readonly<{
  caseName: string;
  description: string;
  input: MutualValueInput;
  expectations: Readonly<{
    forbidden_substrings: readonly string[];
    // claim types that must appear in at least one GIVE or GET item.
    required_claim_types: readonly ("fact" | "hypothesis")[];
    min_give_count: number;
    min_ask_count: number;
  }>;
}>;

const consultantPersonalContext: MutualValueInput["personal_context"] = {
  current_company: "架空コンサルティング合同会社",
  current_role: "シニアコンサルタント",
  items: [
    {
      tags: ["DX", "製造業"],
      text: "製造業向けDXプロジェクトを5年間リードしてきた経験がある",
      type: "past_experience",
    },
    {
      tags: ["提案"],
      text: "現場から経営層への変革提案を得意としている",
      type: "strong_skill",
    },
    {
      tags: ["AI"],
      text: "生成AIを業務プロセス改善に適用する案件を探している",
      type: "seeking",
    },
  ],
};

const designerPersonalContext: MutualValueInput["personal_context"] = {
  current_company: "Example Design Studio",
  current_role: "UXデザイナー",
  items: [
    {
      tags: ["UX", "モバイル"],
      text: "モバイルアプリのUX設計を専門としている",
      type: "expertise",
    },
  ],
};

const weakPersonalContext: MutualValueInput["personal_context"] = {
  current_company: "農業法人テスト",
  current_role: "農産物バイヤー",
  items: [
    {
      tags: ["農業"],
      text: "国内農産物の調達を担当している",
      type: "current_theme",
    },
  ],
};

const jpCorporateCard: MutualValueInput["card"] = {
  company: "架空産業株式会社",
  department: "プロダクト開発部",
  language: "ja",
  name: "山田 太郎",
  title: "プロダクトマネージャー",
};

const startupCard: MutualValueInput["card"] = {
  company: "架空テック株式会社",
  department: null,
  language: "ja",
  name: "伊藤 健",
  title: "代表取締役CEO",
};

const minimalCard: MutualValueInput["card"] = {
  company: "架空エンタープライズ",
  department: null,
  language: "und",
  name: null,
  title: null,
};

const jpFlashBrief: MutualValueInput["flash_brief"] = {
  potential: "製造DX案件での協業可能性あり",
  say_this: ["現在のDX推進における最大の課題は何ですか？"],
  who: "山田さんは架空産業株式会社のPMで、プロダクト開発を担当している",
  why_you: "DXコンサルの経験がプロダクト戦略の課題解決に直結する可能性がある",
};

const startupFlashBrief: MutualValueInput["flash_brief"] = {
  potential: "スタートアップ支援・パートナーシップの可能性",
  say_this: ["御社が今一番注力している事業領域はどこですか？"],
  who: "伊藤さんは架空テック株式会社のCEOでスタートアップを率いている",
  why_you: "コンサルの視点でスタートアップの成長課題に貢献できる",
};

const minimalFlashBrief: MutualValueInput["flash_brief"] = {
  potential: "詳細不明のため探索段階",
  say_this: ["どのような事業を展開されていますか？"],
  who: "架空エンタープライズ所属（氏名・役職不明）",
  why_you: "接触情報が限定的なため、まず対話で確認が必要",
};

export const mutualValueGoldenCases: readonly MutualValueCase[] = [
  // ── Fact-grounded GIVE/GET ────────────────────────────────────────────────
  {
    caseName: "fact-heavy-give-get",
    description:
      "Card provides rich explicit data — GIVE/GET should include fact-type items grounded in card fields.",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 1,
      required_claim_types: ["fact"],
    },
    input: {
      card: jpCorporateCard,
      flash_brief: jpFlashBrief,
      locale: "ja",
      meeting_goal: "networking",
      personal_context: consultantPersonalContext,
    },
  },

  // ── Hypothesis-dominated ──────────────────────────────────────────────────
  {
    caseName: "hypothesis-heavy-startup",
    description:
      "Startup CEO with minimal card data — most GIVE/GET should be hypotheses.",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 1,
      required_claim_types: ["hypothesis"],
    },
    input: {
      card: startupCard,
      flash_brief: startupFlashBrief,
      locale: "ja",
      meeting_goal: "partnership",
      personal_context: consultantPersonalContext,
    },
  },

  // ── Mixed claim types ─────────────────────────────────────────────────────
  {
    caseName: "mixed-claim-types",
    description:
      "Rich card + inferred context — output should include both facts and hypotheses.",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 2,
      required_claim_types: ["fact", "hypothesis"],
    },
    input: {
      card: {
        company: "架空製造DX株式会社",
        department: "デジタル戦略部",
        email: "m.nakamura@example.invalid",
        language: "ja",
        name: "中村 剛",
        title: "部長",
      },
      flash_brief: {
        potential: "製造DX戦略の立案支援で強いシナジー",
        say_this: ["DX戦略の具体的なロードマップはどのように描いていますか？"],
        who: "中村さんは架空製造DX株式会社でデジタル戦略部長を務めている",
        why_you: "製造業DXの現場経験を持つコンサルとして直接貢献できる",
      },
      locale: "ja",
      meeting_goal: "learning_information_exchange",
      personal_context: consultantPersonalContext,
    },
  },

  // ── Sales goal ────────────────────────────────────────────────────────────
  {
    caseName: "sales-goal-give-focused",
    description: "Sales goal — GIVE should emphasize service value the user can offer.",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 2,
      required_claim_types: ["hypothesis"],
    },
    input: {
      card: jpCorporateCard,
      flash_brief: jpFlashBrief,
      locale: "ja",
      meeting_goal: "sales",
      personal_context: consultantPersonalContext,
    },
  },

  // ── Recruiting goal ───────────────────────────────────────────────────────
  {
    caseName: "recruiting-goal-get-focused",
    description:
      "Recruiting goal — GET items should include talent / team composition insights.",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 1,
      required_claim_types: ["hypothesis"],
    },
    input: {
      card: startupCard,
      flash_brief: startupFlashBrief,
      locale: "ja",
      meeting_goal: "recruiting",
      personal_context: {
        current_company: "架空HR",
        current_role: "採用コンサルタント",
        items: [
          {
            tags: ["採用", "スタートアップ"],
            text: "スタートアップのエンジニア採用支援が専門",
            type: "offer",
          },
        ],
      },
    },
  },

  // ── Strong BRIDGE ─────────────────────────────────────────────────────────
  {
    caseName: "strong-bridge-complementarity",
    description:
      "User's skills directly complement contact's domain — BRIDGE should articulate strong complementarity.",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 1,
      required_claim_types: ["fact", "hypothesis"],
    },
    input: {
      card: {
        company: "架空重工業株式会社",
        department: "デジタルイノベーション推進本部",
        language: "ja",
        name: "渡辺 誠",
        title: "本部長",
      },
      flash_brief: {
        potential: "大企業DX内製化とコンサル支援の補完関係が強い",
        say_this: ["内製とアウトソーシングのバランスはどのようにお考えですか？"],
        who: "渡辺さんは架空重工業のDXイノベーション推進本部長",
        why_you: "製造業DXの現場知識と提案力が直接役立つ",
      },
      locale: "ja",
      meeting_goal: "learning_information_exchange",
      personal_context: consultantPersonalContext,
    },
  },

  // ── Weak overlap → discovery-focused ASK ─────────────────────────────────
  {
    caseName: "weak-overlap-discovery-ask",
    description:
      "Minimal overlap between user (agriculture) and contact (AI research) — ASK should probe for discovery.",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 1,
      required_claim_types: ["hypothesis"],
    },
    input: {
      card: {
        company: "架空テクノロジー株式会社",
        department: "AI研究所",
        language: "ja",
        name: "佐々木 実",
        title: "主任研究員",
      },
      flash_brief: {
        potential: "農業×AI応用の可能性は探索段階",
        say_this: ["AIの応用で最も手応えを感じている分野はどこですか？"],
        who: "佐々木さんは架空テクノロジーのAI研究所主任研究員",
        why_you: "農業データ活用とAI研究の接点を探る価値がある",
      },
      locale: "ja",
      meeting_goal: "networking",
      personal_context: weakPersonalContext,
    },
  },

  // ── Partnership → concrete NEXT ACTION ────────────────────────────────────
  {
    caseName: "partnership-concrete-next-action",
    description:
      "Partnership goal — NEXT action should be concrete (e.g., propose a follow-up meeting).",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 1,
      required_claim_types: ["hypothesis"],
    },
    input: {
      card: startupCard,
      flash_brief: startupFlashBrief,
      locale: "ja",
      meeting_goal: "partnership",
      personal_context: consultantPersonalContext,
    },
  },

  // ── Minimal data fallback ─────────────────────────────────────────────────
  {
    caseName: "minimal-data-fallback",
    description:
      "Only company name readable — output must not fabricate person-specific facts.",
    expectations: {
      forbidden_substrings: ["田中", "鈴木", "山田"],
      min_ask_count: 1,
      min_give_count: 1,
      required_claim_types: ["hypothesis"],
    },
    input: {
      card: minimalCard,
      flash_brief: minimalFlashBrief,
      locale: "ja",
      meeting_goal: "networking",
      personal_context: consultantPersonalContext,
    },
  },

  // ── UX designer context ───────────────────────────────────────────────────
  {
    caseName: "designer-context-product-manager",
    description:
      "UX designer meets PM — GIVE should include design/UX expertise, GET includes product roadmap insight.",
    expectations: {
      forbidden_substrings: [],
      min_ask_count: 1,
      min_give_count: 1,
      required_claim_types: ["fact", "hypothesis"],
    },
    input: {
      card: jpCorporateCard,
      flash_brief: {
        potential: "UXリサーチとプロダクト戦略の接点が強い",
        say_this: ["ユーザーリサーチを現在どの程度プロダクト開発に取り込んでいますか？"],
        who: "山田さんは架空産業株式会社のPM",
        why_you: "UXデザイナーの視点でプロダクトUX改善に貢献できる",
      },
      locale: "ja",
      meeting_goal: "networking",
      personal_context: designerPersonalContext,
    },
  },
];
