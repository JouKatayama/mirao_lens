import type {
  FlashBriefInput,
  FlashBriefPublic,
  MutualValueInput,
  MutualValuePublic,
} from "@miraio/domain";

import { personaFlashBriefCases } from "./persona-fixtures";

export type JevShadowFixture = Readonly<{
  brief: FlashBriefPublic;
  caseName: string;
  description: string;
  input: FlashBriefInput;
  mutualValue: MutualValuePublic;
}>;

function personaInput(caseName: string): FlashBriefInput {
  const fixture = personaFlashBriefCases.find(
    (candidate) => candidate.caseName === caseName,
  );

  if (!fixture) {
    throw new Error(`Missing persona fixture: ${caseName}`);
  }

  return fixture.input;
}

function toMutualValueInput(
  input: FlashBriefInput,
  brief: FlashBriefPublic,
): MutualValueInput {
  return {
    card: input.card,
    flash_brief: {
      potential: brief.potential,
      say_this: [...brief.say_this],
      who: brief.who,
      why_you: brief.why_you,
    },
    locale: input.locale,
    meeting_goal: input.meeting_goal,
    personal_context: input.personal_context,
  };
}

function defineFixture(fixture: JevShadowFixture): JevShadowFixture {
  // Constructing this value is an explicit type check that the Mutual Value
  // input represented by the fixture remains compatible with the brief and
  // persona input. The shadow harness uses the same construction at runtime.
  void toMutualValueInput(fixture.input, fixture.brief);
  return fixture;
}

const manufacturingInput = personaInput(
  "saas-field-sales/manufacturing-it-manager",
);

const manufacturingBrief: FlashBriefPublic = {
  connection_keywords: ["在庫管理", "製造業", "現場改善"],
  identity_status: "medium_confidence",
  potential:
    "製造業の情報システム課と在庫管理SaaS営業の間に、現場運用を確認できる接点がある。",
  potential_score: 4,
  say_this: [
    "現在の在庫管理で、現場と情報システム課の間にどんな調整が発生していますか？",
    "在庫差異への対応で、今いちばん時間がかかっている工程はどこですか？",
    "全社の在庫管理方針は今年変更される予定ですよね？",
  ],
  who: "架空精密工業株式会社の情報システム課長。",
  why_you:
    "製造業向け在庫管理SaaSの提案経験を基に、在庫運用の実態を具体的に聞ける可能性がある。",
  why_you_claim_type: "hypothesis",
};

const recruitingInput = personaInput(
  "staffing-recruiting-advisor/startup-head-of-people",
);

const recruitingBrief: FlashBriefPublic = {
  connection_keywords: ["採用設計", "スタートアップ", "人事"],
  identity_status: "medium_confidence",
  potential:
    "スタートアップの採用立ち上げ経験と人事責任者の役割に、求人要件設計を話せる接点がある。",
  potential_score: 5,
  say_this: [
    "今、求人要件を固めるうえで最も判断が難しい職種はどこですか？",
    "採用市場の情報で、いま不足しているものはありますか？",
    "急成長中なので、離職率の改善が最優先ですよね？",
  ],
  who: "架空テクノロジーズ株式会社の人事責任者。",
  why_you:
    "スタートアップの採用立ち上げとITエンジニアの求人要件設計の経験を共有できる。",
  why_you_claim_type: "fact",
};

const bankingInput = personaInput(
  "regional-bank-relationship-manager/food-processor-successor",
);

const bankingBrief: FlashBriefPublic = {
  connection_keywords: ["食品加工", "事業承継", "設備投資"],
  identity_status: "medium_confidence",
  potential:
    "食品加工業の設備投資支援経験と専務取締役という役割から、事業承継を含む経営テーマを確認できる接点がある。",
  potential_score: 4,
  say_this: [
    "今後の設備投資で、資金以外に相談相手が必要なテーマはありますか？",
    "食品加工の取引先同士で、紹介が役立ちそうな領域はありますか？",
    "二代目として、すでに事業承継の計画を進めていますよね？",
  ],
  who: "架空食品工業株式会社の専務取締役。",
  why_you:
    "食品加工業の設備投資案件と地域企業の事業承継相談の経験を基に、確認すべき論点を整理できる。",
  why_you_claim_type: "fact",
};

export const jevShadowFixtures: readonly JevShadowFixture[] = [
  defineFixture({
    brief: manufacturingBrief,
    caseName: "saas-field-sales/manufacturing-it-manager",
    description: "製造業向けSaaS営業と情報システム課長",
    input: manufacturingInput,
    mutualValue: {
      ask: [
        {
          question: "在庫差異が起きる工程を確認してもよいですか？",
          validates_hypothesis: "在庫運用に改善余地がある可能性",
        },
      ],
      bridge:
        "在庫管理の提案経験と、情報システム課が把握する運用課題を持ち寄れる。",
      get: [
        {
          claim_type: "hypothesis",
          evidence_ids: [],
          text: "製造現場の在庫運用で情報システム課が調整している論点を学べる可能性がある。",
        },
      ],
      give: [
        {
          claim_type: "fact",
          evidence_ids: [],
          text: "製造業向け在庫管理SaaSの導入提案経験を共有できる。",
        },
        {
          claim_type: "hypothesis",
          evidence_ids: [],
          text: "複数拠点の在庫が毎日一致していないはずなので、解決策を提案できる。",
        },
      ],
      next_action: {
        action: "在庫運用の現状を確認する短い打ち合わせを提案する。",
        reason: "名刺情報だけでは具体的な課題を確定できないため。",
        timing: "名刺交換後1週間以内",
      },
    },
  }),
  defineFixture({
    brief: recruitingBrief,
    caseName: "staffing-recruiting-advisor/startup-head-of-people",
    description: "人材紹介の法人営業とスタートアップ人事責任者",
    input: recruitingInput,
    mutualValue: {
      ask: [
        {
          question: "求人要件を固める前に確認したい市場情報はありますか？",
          validates_hypothesis: "採用要件がまだ固まっていない可能性",
        },
      ],
      bridge:
        "求人要件設計の支援経験と、人事責任者が持つ採用上の判断材料を持ち寄れる。",
      get: [
        {
          claim_type: "hypothesis",
          evidence_ids: [],
          text: "成長企業が求人要件を決める際の実務上の迷いを知れる可能性がある。",
        },
      ],
      give: [
        {
          claim_type: "fact",
          evidence_ids: [],
          text: "ITエンジニア採用の求人要件設計と職種別の市場動向を共有できる。",
        },
        {
          claim_type: "hypothesis",
          evidence_ids: [],
          text: "急成長に伴う大量離職を止める採用計画をすぐ提案できる。",
        },
      ],
      next_action: {
        action: "採用対象職種と求人要件の状況を確認する。",
        reason: "相手の採用課題は名刺だけでは分からないため。",
        timing: "次回の会話",
      },
    },
  }),
  defineFixture({
    brief: bankingBrief,
    caseName: "regional-bank-relationship-manager/food-processor-successor",
    description: "地方銀行の法人渉外と食品加工会社の専務",
    input: bankingInput,
    mutualValue: {
      ask: [
        {
          question: "今後の設備投資で、相談先を探しているテーマはありますか？",
          validates_hypothesis: "設備投資の相談需要がある可能性",
        },
      ],
      bridge:
        "食品加工業の設備投資支援経験と、専務取締役が把握する経営課題を接続できる。",
      get: [
        {
          claim_type: "hypothesis",
          evidence_ids: [],
          text: "地域の食品加工会社が設備投資で重視する条件を学べる可能性がある。",
        },
      ],
      give: [
        {
          claim_type: "fact",
          evidence_ids: [],
          text: "食品加工業の設備投資案件を手掛けた経験と、取引先の紹介機会を共有できる。",
        },
        {
          claim_type: "hypothesis",
          evidence_ids: [],
          text: "二代目なので事業承継の資金計画を必要としているはずだ。",
        },
      ],
      next_action: {
        action: "設備投資と事業承継の関心を確認する。",
        reason: "役職だけから経営課題を断定しないため。",
        timing: "名刺交換後の会話",
      },
    },
  }),
];

export function toJevShadowMutualValueInput(
  fixture: JevShadowFixture,
): MutualValueInput {
  return toMutualValueInput(fixture.input, fixture.brief);
}
