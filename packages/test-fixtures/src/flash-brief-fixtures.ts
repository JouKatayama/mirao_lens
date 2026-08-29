import type { FlashBriefInput, IdentityStatus } from "@miraio/domain";

export type FlashBriefCase = Readonly<{
  caseName: string;
  description: string;
  input: FlashBriefInput;
  expectations: Readonly<{
    allowed_identity_statuses: readonly IdentityStatus[];
    // Strings that must NOT appear in any output field (hallucination guard).
    forbidden_substrings: readonly string[];
  }>;
}>;

const consultantContext: FlashBriefInput["personal_context"] = {
  current_company: "架空コンサルティング合同会社",
  current_role: "シニアコンサルタント",
  items: [
    {
      tags: ["DX", "製造業"],
      text: "製造業向けDXプロジェクトを5年間リードしてきた経験がある",
      type: "past_experience",
    },
    {
      tags: ["提案", "戦略"],
      text: "現場から経営層への変革提案を得意としている",
      type: "strong_skill",
    },
    {
      tags: ["AI活用"],
      text: "生成AIを業務プロセス改善に適用する案件を探している",
      type: "seeking",
    },
  ],
};

const designerContext: FlashBriefInput["personal_context"] = {
  current_company: "Example Design Studio",
  current_role: "UXデザイナー",
  items: [
    {
      tags: ["UX", "プロダクト"],
      text: "モバイルアプリのUX設計を専門としている",
      type: "expertise",
    },
    {
      tags: ["リサーチ"],
      text: "ユーザーインタビューとユーザビリティテストを定期的に実施している",
      type: "strong_skill",
    },
  ],
};

const weaklyRelevantContext: FlashBriefInput["personal_context"] = {
  current_company: "農業法人テスト",
  current_role: "農産物バイヤー",
  items: [
    {
      tags: ["農業", "調達"],
      text: "国内農産物の調達・品質管理を担当している",
      type: "current_theme",
    },
  ],
};

export const flashBriefGoldenCases: readonly FlashBriefCase[] = [
  // ── Normal Japanese corporate ─────────────────────────────────────────────
  {
    caseName: "japanese-corporate-networking",
    description:
      "Normal Japanese corporate card (PM), networking goal, relevant consultant context.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: ["@example.invalid", "実在する"],
    },
    input: {
      card: {
        company: "架空産業株式会社",
        department: "プロダクト開発部",
        language: "ja",
        name: "山田 太郎",
        title: "プロダクトマネージャー",
      },
      locale: "ja",
      meeting_goal: "networking",
      personal_context: consultantContext,
    },
  },

  // ── Sales goal variant ────────────────────────────────────────────────────
  {
    caseName: "japanese-corporate-sales",
    description:
      "Same card as networking case but sales goal — tests goal sensitivity.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: ["@example.invalid"],
    },
    input: {
      card: {
        company: "架空産業株式会社",
        department: "プロダクト開発部",
        language: "ja",
        name: "山田 太郎",
        title: "プロダクトマネージャー",
      },
      locale: "ja",
      meeting_goal: "sales",
      personal_context: consultantContext,
    },
  },

  // ── English card / partnership ─────────────────────────────────────────────
  {
    caseName: "english-corporate-partnership",
    description: "English-language card, CTO, partnership goal.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: ["@example.invalid", "個人情報"],
    },
    input: {
      card: {
        company: "Example Tech Labs",
        department: null,
        email: "j.smith@example.invalid",
        language: "en",
        name: "Jordan Smith",
        title: "Chief Technology Officer",
      },
      locale: "en",
      meeting_goal: "partnership",
      personal_context: {
        current_company: "Example Dev Co",
        current_role: "Senior Engineer",
        items: [
          {
            tags: ["backend", "cloud"],
            text: "Builds distributed backend systems for enterprise clients.",
            type: "expertise",
          },
        ],
      },
    },
  },

  // ── Mixed language, recruiting ─────────────────────────────────────────────
  {
    caseName: "mixed-language-recruiting",
    description: "Mixed Japanese/English card, recruiting goal.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "Example Mix合同会社",
        department: null,
        language: "mixed",
        name: "Sato Yuki",
        title: "Founder / 代表",
      },
      locale: "ja",
      meeting_goal: "recruiting",
      personal_context: {
        current_company: "Example HR Partners",
        current_role: "採用担当",
        items: [
          {
            tags: ["スタートアップ", "採用"],
            text: "スタートアップ向けの採用支援を行っている",
            type: "offer",
          },
        ],
      },
    },
  },

  // ── No title ──────────────────────────────────────────────────────────────
  {
    caseName: "no-title-card",
    description: "Card has name and company but no title — tests graceful degradation.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: ["役職不明", "不明なタイトル"],
    },
    input: {
      card: {
        company: "架空製造株式会社",
        department: "製造技術部",
        language: "ja",
        name: "鈴木 花子",
        title: null,
      },
      locale: "ja",
      meeting_goal: "networking",
      personal_context: consultantContext,
    },
  },

  // ── No department ─────────────────────────────────────────────────────────
  {
    caseName: "no-department-card",
    description: "Card has name, company, title but no department.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "架空商事株式会社",
        department: null,
        language: "ja",
        name: "田中 一郎",
        title: "営業部長",
      },
      locale: "ja",
      meeting_goal: "sales",
      personal_context: designerContext,
    },
  },

  // ── Sole proprietor ───────────────────────────────────────────────────────
  {
    caseName: "sole-proprietor",
    description:
      "No company field — sole proprietor / freelancer. Identity should be unresolved.",
    expectations: {
      allowed_identity_statuses: ["unresolved", "medium_confidence"],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: null,
        department: null,
        email: "solo.test@example.invalid",
        language: "en",
        name: "Morgan Solo",
        title: "Independent Design Consultant",
        website: "https://solo.example.invalid",
      },
      locale: "en",
      meeting_goal: "networking",
      personal_context: designerContext,
    },
  },

  // ── Startup executive ─────────────────────────────────────────────────────
  {
    caseName: "startup-executive",
    description: "Startup CEO with limited company info available.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "架空テック株式会社",
        department: null,
        language: "ja",
        name: "伊藤 健",
        title: "代表取締役CEO",
      },
      locale: "ja",
      meeting_goal: "partnership",
      personal_context: consultantContext,
    },
  },

  // ── Large company manager ─────────────────────────────────────────────────
  {
    caseName: "large-company-manager",
    description: "Senior manager at a recognizable large company archetype.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "架空重工業株式会社",
        department: "デジタルイノベーション推進本部",
        language: "ja",
        name: "渡辺 誠",
        title: "本部長",
      },
      locale: "ja",
      meeting_goal: "learning_information_exchange",
      personal_context: consultantContext,
    },
  },

  // ── Minimal data: company only readable ──────────────────────────────────
  {
    caseName: "minimal-data-company-only",
    description:
      "Low-quality scan: only company name readable. Tests graceful degradation to industry/role taxonomy.",
    expectations: {
      allowed_identity_statuses: ["unresolved"],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "架空エンタープライズ",
        department: null,
        language: "und",
        name: null,
        title: null,
      },
      locale: "ja",
      meeting_goal: "networking",
      personal_context: consultantContext,
    },
  },

  // ── Unresolved identity — floor enforced ─────────────────────────────────
  {
    caseName: "unresolved-identity-floor",
    description:
      "Common name, no confirming signals. prior_identity_status forces unresolved floor.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "架空商事",
        department: null,
        language: "ja",
        name: "田中 太郎",
        title: "担当",
      },
      locale: "ja",
      meeting_goal: "networking",
      personal_context: consultantContext,
      prior_identity_status: "unresolved",
    },
  },

  // ── High-confidence identity floor ───────────────────────────────────────
  {
    caseName: "high-confidence-identity-floor",
    description:
      "Prior identity already confirmed high_confidence — output must not downgrade.",
    expectations: {
      allowed_identity_statuses: ["high_confidence", "verified"],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "架空ソリューションズ株式会社",
        department: "事業開発部",
        language: "ja",
        name: "小林 美咲",
        title: "事業開発マネージャー",
      },
      locale: "ja",
      meeting_goal: "partnership",
      personal_context: consultantContext,
      prior_identity_status: "high_confidence",
    },
  },

  // ── Highly relevant context ───────────────────────────────────────────────
  {
    caseName: "highly-relevant-context",
    description:
      "User's expertise directly matches contact's domain — expect strong WHY YOU personalization.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "架空製造DX株式会社",
        department: "デジタル戦略部",
        language: "ja",
        name: "中村 剛",
        title: "部長",
      },
      locale: "ja",
      meeting_goal: "learning_information_exchange",
      personal_context: consultantContext,
    },
  },

  // ── Weakly relevant context ───────────────────────────────────────────────
  {
    caseName: "weakly-relevant-context",
    description:
      "Minimal overlap between user's agriculture background and contact's tech role — expect concise, grounded output.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: [],
    },
    input: {
      card: {
        company: "架空テクノロジー株式会社",
        department: "AI研究所",
        language: "ja",
        name: "佐々木 実",
        title: "主任研究員",
      },
      locale: "ja",
      meeting_goal: "networking",
      personal_context: weaklyRelevantContext,
    },
  },

  // ── Multiple contact fields ───────────────────────────────────────────────
  {
    caseName: "multiple-contact-fields",
    description:
      "Card with name, company, title, email, phone, website — rich card data.",
    expectations: {
      allowed_identity_statuses: [
        "unresolved",
        "medium_confidence",
        "high_confidence",
        "verified",
      ],
      forbidden_substrings: ["@example.invalid"],
    },
    input: {
      card: {
        company: "架空グローバル株式会社",
        department: "海外事業部",
        email: "t.yamamoto@example.invalid",
        language: "ja",
        name: "山本 拓也",
        phone: "+81 90 0000 0001",
        title: "部長",
        website: "https://example.invalid",
      },
      locale: "ja",
      meeting_goal: "sales",
      personal_context: consultantContext,
    },
  },
];
