import type { CompanyContext, FlashBriefInput } from "@miraio/domain";

/**
 * Manufacturing A/B/C comparison cases (ML-030).
 *
 * The 2026-11-01 strategy asks whether a sales rep at a manufacturing AI/DX
 * company gets a better first question from Miraio than from ChatGPT used by
 * hand, and whether the Opportunity Playbook adds to that. Each case is one
 * first meeting: a seller (what the user sells) times a counterpart (who they
 * met). Every condition receives the same card, company context and seller
 * profile, so the comparison is between methods, not between inputs.
 *
 * Data richness is part of the case because the strategy expects the playbook
 * to matter most when the card says little.
 *
 * No real people, no real companies, `.invalid` domains only.
 */

export const dataRichnessLevels = ["rich", "thin", "minimal"] as const;

export type DataRichness = (typeof dataRichnessLevels)[number];

export type ComparisonSeller = Readonly<{
  sellerId: string;
  label: string;
  personal_context: FlashBriefInput["personal_context"];
}>;

export type ComparisonCounterpart = Readonly<{
  slug: string;
  description: string;
  data_richness: DataRichness;
  card: FlashBriefInput["card"];
  company_context: CompanyContext | null;
}>;

export type ManufacturingComparisonCase = Readonly<{
  caseName: string;
  sellerLabel: string;
  description: string;
  data_richness: DataRichness;
  input: FlashBriefInput;
}>;

export const comparisonSellers: readonly ComparisonSeller[] = [
  {
    label: "外観検査AI企業の営業責任者",
    personal_context: {
      current_company: "架空ビジョンテック株式会社",
      current_role: "営業責任者",
      items: [
        { tags: [], text: "製造業向けの外観検査AIを提供", type: "offer" },
        {
          tags: [],
          text: "画像解析による検査自動化の導入支援",
          type: "expertise",
        },
        {
          tags: [],
          text: "検査工程の自動化を検討している工場",
          type: "seeking",
        },
      ],
    },
    sellerId: "visual-inspection",
  },
  {
    label: "予知保全企業のフィールドセールス",
    personal_context: {
      current_company: "架空センシング株式会社",
      current_role: "フィールドセールス",
      items: [
        { tags: [], text: "設備IoT・予知保全サービスを提供", type: "offer" },
        { tags: [], text: "振動センサーによる設備監視", type: "expertise" },
        { tags: [], text: "設備停止に悩む工場", type: "seeking" },
      ],
    },
    sellerId: "predictive-maintenance",
  },
  {
    label: "製造業向けAIエージェント企業のBizDev",
    personal_context: {
      current_company: "架空エージェントラボ株式会社",
      current_role: "BizDev",
      items: [
        {
          tags: [],
          text: "製造業向けの業務DX・AIエージェントを提供",
          type: "offer",
        },
        { tags: [], text: "生成AIの業務活用", type: "current_theme" },
        { tags: [], text: "現場業務のDXを進めたい製造業", type: "seeking" },
      ],
    },
    sellerId: "manufacturing-agent",
  },
];

function companyContext(
  overrides: Partial<CompanyContext> & Pick<CompanyContext, "industry">,
): CompanyContext {
  return {
    company_description: null,
    company_scale: "unknown",
    role_level: "unknown",
    role_scope: null,
    sources: [],
    ...overrides,
  };
}

export const comparisonCounterparts: readonly ComparisonCounterpart[] = [
  {
    card: {
      company: "架空食品工業株式会社",
      department: "品質保証部",
      email: "quality@food.example.invalid",
      language: "ja",
      name: "高田 真理",
      title: "課長",
      website: "https://food.example.invalid",
    },
    company_context: companyContext({
      company_description: "冷凍食品を製造する架空の食品メーカー。",
      company_scale: "enterprise",
      industry: "食品製造",
      role_level: "manager",
      role_scope: "品質保証と検査工程の管理",
    }),
    data_richness: "rich",
    description: "食品メーカーの品質保証課長。会社情報あり。",
    slug: "food-quality-manager",
  },
  {
    card: {
      company: "架空精機部品株式会社",
      department: "設備保全課",
      email: "hozen@parts.example.invalid",
      language: "ja",
      name: "大野 剛",
      title: "係長",
      website: "https://parts.example.invalid",
    },
    company_context: companyContext({
      company_description: "自動車向け精密部品を製造する架空のメーカー。",
      company_scale: "sme",
      industry: "自動車部品製造",
      role_level: "manager",
      role_scope: "生産設備の保全計画と故障対応",
    }),
    data_richness: "rich",
    description: "自動車部品メーカーの設備保全係長。会社情報あり。",
    slug: "auto-parts-maintenance",
  },
  {
    card: {
      company: "架空装置株式会社",
      department: "制御ソフト設計課",
      language: "ja",
      name: "森 健太",
      title: "主任",
    },
    company_context: companyContext({
      company_description: "半導体製造装置を開発する架空の装置メーカー。",
      company_scale: "enterprise",
      industry: "製造装置",
      role_level: "individual_contributor",
      role_scope: "装置制御ソフトウェアの設計",
    }),
    data_richness: "rich",
    description: "装置メーカーの制御ソフト設計者。会社情報あり。",
    slug: "equipment-maker-software",
  },
  {
    card: {
      company: "架空電子株式会社",
      department: "生産技術部",
      language: "ja",
      name: "木村 優",
      title: "部長",
    },
    company_context: null,
    data_richness: "thin",
    description: "電子部品メーカーの生産技術部長。名刺情報のみ。",
    slug: "electronics-production-engineering",
  },
  {
    card: {
      company: "架空化成株式会社",
      department: "千葉工場",
      language: "ja",
      name: "石井 学",
      title: "工場長",
    },
    company_context: null,
    data_richness: "thin",
    description: "化学メーカーの工場長。名刺情報のみ。",
    slug: "chemical-plant-manager",
  },
  {
    card: {
      company: "架空機械製作所",
      department: "生産管理部",
      language: "ja",
      name: "原 直樹",
      title: "課長",
    },
    company_context: null,
    data_richness: "thin",
    description: "機械メーカーの生産管理課長。名刺情報のみ。",
    slug: "machinery-production-control",
  },
  {
    card: {
      company: "架空金属工業株式会社",
      department: "DX推進室",
      language: "ja",
      name: null,
      title: null,
    },
    company_context: null,
    data_richness: "minimal",
    description: "金属加工メーカーのDX推進室。氏名・役職なし。",
    slug: "metal-dx-office",
  },
  {
    card: {
      company: "架空樹脂成形株式会社",
      department: null,
      language: "ja",
      name: null,
      title: null,
    },
    company_context: null,
    data_richness: "minimal",
    description: "樹脂成形メーカー。会社名のみ。",
    slug: "resin-company-only",
  },
];

export function buildManufacturingComparisonCases(
  sellers: readonly ComparisonSeller[] = comparisonSellers,
  counterparts: readonly ComparisonCounterpart[] = comparisonCounterparts,
): ManufacturingComparisonCase[] {
  return sellers.flatMap((seller) =>
    counterparts.map((counterpart) => ({
      caseName: `${seller.sellerId}/${counterpart.slug}`,
      data_richness: counterpart.data_richness,
      description: counterpart.description,
      input: {
        card: counterpart.card,
        company_context: counterpart.company_context,
        locale: "ja",
        meeting_goal: "sales",
        personal_context: seller.personal_context,
      },
      sellerLabel: seller.label,
    })),
  );
}

export const manufacturingComparisonCases = buildManufacturingComparisonCases();
