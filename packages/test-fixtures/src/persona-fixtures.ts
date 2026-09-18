import type {
  FlashBriefInput,
  IdentityStatus,
  MeetingGoal,
} from "@miraio/domain";

import type { FlashBriefCase } from "./flash-brief-fixtures";

/**
 * Personas: evaluation inputs described by who the user is, not by one case.
 *
 * The 15 hand-written Flash Brief cases in `flash-brief-fixtures.ts` each pin a
 * whole situation — one card, one goal, one Personal Context — so widening
 * coverage means writing another whole case, and the breadth of the set is
 * capped by whoever is writing them.
 *
 * A persona inverts that. It holds the stable half (who the user is, what they
 * sell, what they are looking for) once, and lists the counterparts that user
 * plausibly exchanges cards with. Cases are the cross product, so adding one
 * counterpart adds a case to that persona, and adding a persona multiplies the
 * set. The personas below are seeds meant to be replaced or extended from real
 * research into who exchanges the most cards; the shape is what matters here.
 *
 * Personas do not measure card reading. Every card below is already-parsed
 * field data, so a persona case exercises the reasoning stages only — OCR
 * accuracy needs photographs of real cards under real conditions and cannot be
 * reached from synthetic data of any shape.
 *
 * As with every asset in this directory: no real people, no real companies,
 * `.invalid` domains only.
 */

export type PersonaCounterpart = Readonly<{
  /** Unique within its persona; forms the second half of the case name. */
  slug: string;
  description: string;
  card: FlashBriefInput["card"];
  locale: FlashBriefInput["locale"];
  meeting_goal: MeetingGoal;
  /**
   * Defaults to every status. Narrow it when the card genuinely does not
   * support a confident identification — that is the case worth having, since
   * over-claiming on a thin card is the failure users report as "wrong person".
   */
  allowed_identity_statuses?: readonly IdentityStatus[];
  /** Merged with the persona's list rather than replacing it. */
  forbidden_substrings?: readonly string[];
}>;

export type EvalPersona = Readonly<{
  /** Kebab-case; forms the first half of every case name it generates. */
  personaId: string;
  label: string;
  /** Why this persona is worth evaluating — the demand it stands for. */
  rationale: string;
  personal_context: FlashBriefInput["personal_context"];
  counterparts: readonly PersonaCounterpart[];
  forbidden_substrings: readonly string[];
}>;

const everyIdentityStatus: readonly IdentityStatus[] = [
  "unresolved",
  "medium_confidence",
  "high_confidence",
  "verified",
];

/**
 * Shared across personas: a brief must never echo the synthetic address space
 * back at the user, and must never reach for the inferences the product spec
 * rules out.
 */
const baseForbiddenSubstrings: readonly string[] = [
  "example.invalid",
  "実在",
  "個人情報",
];

const saasSalesPersona: EvalPersona = {
  personaId: "saas-field-sales",
  label: "SaaS法人営業（フィールドセールス）",
  rationale:
    "展示会とセミナーで一日に数十枚を交換し、交換直後の一手が受注率に直結する。名刺交換の頻度と、交換後の打ち手の価値がどちらも高い層。",
  forbidden_substrings: [...baseForbiddenSubstrings, "導入実績", "受注確度"],
  personal_context: {
    current_company: "架空クラウド株式会社",
    current_role: "法人営業 / フィールドセールス",
    items: [
      {
        tags: ["SaaS", "在庫管理"],
        text: "製造業向けの在庫管理SaaSの導入提案を担当している",
        type: "expertise",
      },
      {
        tags: ["製造業", "現場改善"],
        text: "中堅製造業の現場オペレーション改善を50社以上支援してきた",
        type: "past_experience",
      },
      {
        tags: ["合意形成"],
        text: "現場担当者と情報システム部門の間で要件の合意を作るのが得意",
        type: "strong_skill",
      },
      {
        tags: ["決裁"],
        text: "展示会で会った担当者から決裁者につないでもらう流れを作りたい",
        type: "seeking",
      },
    ],
  },
  counterparts: [
    {
      slug: "manufacturing-it-manager",
      description:
        "展示会で会った中堅製造業の情報システム課長。営業ゴール、接点が濃い組み合わせ。",
      card: {
        company: "架空精密工業株式会社",
        department: "情報システム課",
        language: "ja",
        name: "佐藤 健一",
        title: "課長",
      },
      locale: "ja",
      meeting_goal: "sales",
    },
    {
      slug: "partner-alliance-lead",
      description:
        "同業SaaSのアライアンス担当。競合にも補完相手にもなり得るため、複雑性を作りすぎないかを見る。",
      card: {
        company: "架空ワークス株式会社",
        department: "事業開発部",
        email: "alliance@kakuu-works.example.invalid",
        language: "ja",
        name: "村田 彩",
        title: "アライアンスマネージャー",
      },
      locale: "ja",
      meeting_goal: "partnership",
    },
    {
      slug: "title-less-card",
      description:
        "肩書きも部署も印字されていない名刺。断定を避けられるか、身元確度を上げすぎないかを見る。",
      card: {
        company: "架空商事株式会社",
        department: null,
        language: "ja",
        name: "大西 涼",
        title: null,
      },
      locale: "ja",
      meeting_goal: "networking",
      allowed_identity_statuses: ["unresolved", "medium_confidence"],
    },
  ],
};

const recruitingSalesPersona: EvalPersona = {
  personaId: "staffing-recruiting-advisor",
  label: "人材紹介の法人営業（リクルーティングアドバイザー）",
  rationale:
    "交換相手の採用課題を短時間で読み違えずに掴む必要があり、外した提案が最も嫌われる領域。需要の強さと、誤った推測のコストがどちらも高い。",
  forbidden_substrings: [...baseForbiddenSubstrings, "年収", "離職"],
  personal_context: {
    current_company: "架空キャリアパートナーズ株式会社",
    current_role: "法人営業 / リクルーティングアドバイザー",
    items: [
      {
        tags: ["採用", "エンジニア"],
        text: "ITエンジニア採用の求人要件を企業と一緒に設計している",
        type: "expertise",
      },
      {
        tags: ["スタートアップ"],
        text: "スタートアップの採用立ち上げを初期メンバーの段階から支援した経験がある",
        type: "past_experience",
      },
      {
        tags: ["市場データ"],
        text: "職種別の採用市場動向と求人要件の相場感を共有できる",
        type: "offer",
      },
      {
        tags: ["成長企業"],
        text: "採用計画はあるが要件が固まっていない成長企業と話したい",
        type: "seeking",
      },
    ],
  },
  counterparts: [
    {
      slug: "startup-head-of-people",
      description: "急成長スタートアップの人事責任者。採用ゴールの本命ケース。",
      card: {
        company: "架空テクノロジーズ株式会社",
        department: "コーポレート本部",
        language: "ja",
        name: "北条 美咲",
        title: "人事責任者",
      },
      locale: "ja",
      meeting_goal: "recruiting",
    },
    {
      slug: "procurement-officer-weak-fit",
      description:
        "大手SIerの調達部門。採用とは接点が薄い相手で、無理な共通点をでっち上げないかを見る。",
      card: {
        company: "架空システムズ株式会社",
        department: "購買部",
        language: "ja",
        name: "浜田 徹",
        title: "主任",
      },
      locale: "ja",
      meeting_goal: "sales",
    },
    {
      slug: "foreign-hr-director",
      description: "英語名刺の外資系企業HR。英語ロケールでの出力品質を見る。",
      card: {
        company: "Example Global Solutions",
        department: "Human Resources",
        email: "d.keller@example.invalid",
        language: "en",
        name: "Dana Keller",
        title: "HR Director, APAC",
      },
      locale: "en",
      meeting_goal: "partnership",
    },
  ],
};

const regionalBankPersona: EvalPersona = {
  personaId: "regional-bank-relationship-manager",
  label: "地方銀行の法人渉外",
  rationale:
    "交換枚数が多く、価値の源泉が商品ではなく取引先同士のつなぎ込みにある。相互価値の質がそのまま成果になる層。",
  forbidden_substrings: [...baseForbiddenSubstrings, "与信", "格付"],
  personal_context: {
    current_company: "架空第一銀行",
    current_role: "法人渉外",
    items: [
      {
        tags: ["中小企業", "事業承継"],
        text: "地域中小企業の資金繰りと事業承継の相談を担当している",
        type: "expertise",
      },
      {
        tags: ["マッチング"],
        text: "取引先同士のビジネスマッチングを紹介できる",
        type: "offer",
      },
      {
        tags: ["食品加工", "設備投資"],
        text: "食品加工業の設備投資案件を多数手掛けてきた",
        type: "past_experience",
      },
      {
        tags: ["承継"],
        text: "事業承継の相談を、切羽詰まる前の段階で受けられる関係を作りたい",
        type: "current_theme",
      },
    ],
  },
  counterparts: [
    {
      slug: "food-processor-successor",
      description:
        "地域の食品加工会社の二代目専務。持ち駒がそのまま噛み合う本命ケース。",
      card: {
        company: "架空食品工業株式会社",
        department: null,
        language: "ja",
        name: "岩瀬 隆司",
        title: "専務取締役",
      },
      locale: "ja",
      meeting_goal: "networking",
    },
    {
      slug: "early-stage-founder",
      description:
        "創業期IT企業の代表。融資の型に当てはめずに情報交換として扱えるかを見る。",
      card: {
        company: "架空ラボ合同会社",
        department: null,
        email: "founder@kakuu-lab.example.invalid",
        language: "ja",
        name: "三浦 奏",
        title: "代表社員",
      },
      locale: "ja",
      meeting_goal: "learning_information_exchange",
    },
    {
      slug: "minimal-card",
      description:
        "会社名と氏名しか読めていない名刺。情報が薄いときに何を言わずにおけるかを見る。",
      card: {
        company: "架空建材株式会社",
        department: null,
        language: "ja",
        name: "関 由紀夫",
        title: null,
      },
      locale: "ja",
      meeting_goal: "other",
      allowed_identity_statuses: ["unresolved"],
    },
  ],
};

export const evalPersonas: readonly EvalPersona[] = [
  saasSalesPersona,
  recruitingSalesPersona,
  regionalBankPersona,
];

/**
 * Case names are `<personaId>/<slug>` so a failing case in a run report names
 * the persona it came from without a lookup.
 */
export function personaCaseName(
  persona: EvalPersona,
  counterpart: PersonaCounterpart,
): string {
  return `${persona.personaId}/${counterpart.slug}`;
}

/**
 * Expands personas into the same `FlashBriefCase` shape the hand-written
 * golden set uses, so the existing deterministic assertions apply unchanged.
 */
export function buildPersonaFlashBriefCases(
  personas: readonly EvalPersona[] = evalPersonas,
): readonly FlashBriefCase[] {
  return personas.flatMap((persona) =>
    persona.counterparts.map((counterpart) => ({
      caseName: personaCaseName(persona, counterpart),
      description: `${persona.label}: ${counterpart.description}`,
      expectations: {
        allowed_identity_statuses:
          counterpart.allowed_identity_statuses ?? everyIdentityStatus,
        forbidden_substrings: [
          ...persona.forbidden_substrings,
          ...(counterpart.forbidden_substrings ?? []),
        ],
      },
      input: {
        card: counterpart.card,
        locale: counterpart.locale,
        meeting_goal: counterpart.meeting_goal,
        personal_context: persona.personal_context,
      },
    })),
  );
}

export const personaFlashBriefCases: readonly FlashBriefCase[] =
  buildPersonaFlashBriefCases();
