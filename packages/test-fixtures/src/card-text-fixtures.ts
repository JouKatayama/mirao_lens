import type { CardFieldName } from "@miraio/domain";

/**
 * Field-assignment cases for the eight extracted card fields.
 *
 * These deliberately stop short of images. A synthetic card rendered from
 * markup carries none of the conditions that make real card photography hard —
 * angle, shadow, glare, a folded corner — so accuracy measured on synthetic
 * images would describe a situation that never occurs. What is valid to measure
 * synthetically is the half that comes after character recognition: deciding
 * which line is the company and which is the department. That decision is
 * where a Japanese card breaks a reader, and its input — text lines in reading
 * order — is exactly what any OCR produces.
 *
 * Character recognition itself has to be measured on photographs of physical
 * (fictional) cards. These cases do not substitute for that.
 */
export type CardTextFixture = Readonly<{
  caseName: string;
  /** Lines as a page-order OCR would emit them, top to bottom. */
  ocrLines: readonly string[];
  /** The assignment a correct reading produces. */
  expected: Readonly<Record<CardFieldName, string | null>>;
  /**
   * Renderings that are also defensible for a field. Present only where the
   * card itself is genuinely ambiguous, never to excuse a wrong answer.
   */
  alternatives?: Readonly<Partial<Record<CardFieldName, readonly string[]>>>;
  /** What this case is testing. */
  note: string;
}>;

const empty = {
  address: null,
  company: null,
  department: null,
  email: null,
  name: null,
  phone: null,
  title: null,
  website: null,
} as const;

export const cardTextFixtures: readonly CardTextFixture[] = [
  {
    caseName: "japanese-standard",
    note: "部署と役職が別行にある基本形。",
    ocrLines: [
      "ミライオ架空株式会社",
      "営業部",
      "部長",
      "架空 太郎",
      "TEL: 03-5555-0100",
      "kakuu.taro@miraio-kakuu.invalid",
    ],
    expected: {
      ...empty,
      company: "ミライオ架空株式会社",
      department: "営業部",
      email: "kakuu.taro@miraio-kakuu.invalid",
      name: "架空 太郎",
      phone: "03-5555-0100",
      title: "部長",
    },
  },
  {
    caseName: "department-and-title-one-line",
    note: "部署と役職が1行に並ぶ。分割できるか。",
    ocrLines: [
      "サンプル商事株式会社",
      "営業部 部長",
      "見本 花子",
      "03-5555-0101",
    ],
    expected: {
      ...empty,
      company: "サンプル商事株式会社",
      department: "営業部",
      name: "見本 花子",
      phone: "03-5555-0101",
      title: "部長",
    },
  },
  {
    caseName: "company-suffix-trailing",
    note: "法人格が社名の後ろに離れて置かれる。社名の切り出し範囲。",
    ocrLines: [
      "架空テクノロジー 株式会社",
      "開発本部 マネージャー",
      "試作 次郎",
      "shisaku@kakuu-tech.invalid",
    ],
    expected: {
      ...empty,
      company: "架空テクノロジー 株式会社",
      department: "開発本部",
      email: "shisaku@kakuu-tech.invalid",
      name: "試作 次郎",
      title: "マネージャー",
    },
  },
  {
    caseName: "bilingual-japanese-english",
    note: "日英併記。同一実体の2表記のどちらを採るかは名刺自体が曖昧。",
    ocrLines: [
      "ミライオ架空株式会社",
      "MIRAIO KAKUU Inc.",
      "マーケティング部",
      "架空 三郎 / Saburo Kakuu",
      "www.miraio-kakuu.invalid",
    ],
    expected: {
      ...empty,
      company: "ミライオ架空株式会社",
      department: "マーケティング部",
      name: "架空 三郎",
      website: "www.miraio-kakuu.invalid",
    },
    alternatives: {
      company: ["MIRAIO KAKUU Inc."],
      name: ["架空 三郎 / Saburo Kakuu", "Saburo Kakuu"],
    },
  },
  {
    caseName: "logo-only-company",
    note: "社名がロゴのみで文字として存在しない。company は null でなければならない。",
    ocrLines: [
      "先端事業推進室",
      "室長",
      "図案 四郎",
      "zuan@logo-only.invalid",
      "03-5555-0102",
    ],
    expected: {
      ...empty,
      department: "先端事業推進室",
      email: "zuan@logo-only.invalid",
      name: "図案 四郎",
      phone: "03-5555-0102",
      title: "室長",
    },
  },
  {
    caseName: "no-title",
    note: "役職がない。部署から役職を推測しないこと。",
    ocrLines: [
      "架空デザイン合同会社",
      "制作部",
      "意匠 五郎",
      "isho@kakuu-design.invalid",
    ],
    expected: {
      ...empty,
      company: "架空デザイン合同会社",
      department: "制作部",
      email: "isho@kakuu-design.invalid",
      name: "意匠 五郎",
    },
  },
  {
    caseName: "no-department",
    note: "部署がなく役職のみ。役職を部署に入れないこと。",
    ocrLines: [
      "架空ホールディングス株式会社",
      "代表取締役",
      "統括 六郎",
      "03-5555-0103",
    ],
    expected: {
      ...empty,
      company: "架空ホールディングス株式会社",
      name: "統括 六郎",
      phone: "03-5555-0103",
      title: "代表取締役",
    },
  },
  {
    caseName: "two-phones",
    note: "固定と携帯の2件。可視の値を改行で1フィールドに保持する規約。",
    ocrLines: [
      "サンプル製作所株式会社",
      "技術部 主任",
      "工作 七郎",
      "TEL 03-5555-0104",
      "携帯 090-5555-0105",
    ],
    expected: {
      ...empty,
      company: "サンプル製作所株式会社",
      department: "技術部",
      name: "工作 七郎",
      phone: "03-5555-0104\n090-5555-0105",
      title: "主任",
    },
    alternatives: {
      phone: ["090-5555-0105\n03-5555-0104"],
    },
  },
  {
    caseName: "fax-alongside-phone",
    note: "FAXが併記。仕様がFAXの扱いを定めていないため両方を許容する（仕様の穴）。",
    ocrLines: [
      "架空印刷株式会社",
      "営業二部",
      "刷版 八郎",
      "TEL 03-5555-0106",
      "FAX 03-5555-0107",
    ],
    expected: {
      ...empty,
      company: "架空印刷株式会社",
      department: "営業二部",
      name: "刷版 八郎",
      phone: "03-5555-0106",
    },
    alternatives: {
      phone: ["03-5555-0106\n03-5555-0107"],
    },
  },
  {
    caseName: "two-emails",
    note: "メール2件。改行で保持。",
    ocrLines: [
      "架空リサーチ株式会社",
      "調査部 研究員",
      "調査 九郎",
      "kuro@kakuu-research.invalid",
      "kuro.private@kakuu-mail.invalid",
    ],
    expected: {
      ...empty,
      company: "架空リサーチ株式会社",
      department: "調査部",
      email: "kuro@kakuu-research.invalid\nkuro.private@kakuu-mail.invalid",
      name: "調査 九郎",
      title: "研究員",
    },
  },
  {
    caseName: "postal-code-address-one-line",
    note: "郵便番号を含む住所が1行。",
    ocrLines: [
      "架空建設株式会社",
      "工務部 課長",
      "建部 十郎",
      "〒100-0000 架空県架空市架空町1-2-3",
    ],
    expected: {
      ...empty,
      address: "〒100-0000 架空県架空市架空町1-2-3",
      company: "架空建設株式会社",
      department: "工務部",
      name: "建部 十郎",
      title: "課長",
    },
  },
  {
    caseName: "address-two-lines",
    note: "住所が2行に折り返されている。",
    ocrLines: [
      "架空商会株式会社",
      "仕入部",
      "仕入 一子",
      "〒200-0000 架空県架空市",
      "架空ビル 12階",
    ],
    expected: {
      ...empty,
      address: "〒200-0000 架空県架空市\n架空ビル 12階",
      company: "架空商会株式会社",
      department: "仕入部",
      name: "仕入 一子",
    },
    alternatives: {
      address: ["〒200-0000 架空県架空市 架空ビル 12階"],
    },
  },
  {
    caseName: "english-only",
    note: "英語のみの名刺。",
    ocrLines: [
      "Kakuu Global Inc.",
      "Head of Partnerships",
      "Alex Fictional",
      "alex@kakuu-global.invalid",
      "+1-555-0100",
    ],
    expected: {
      ...empty,
      company: "Kakuu Global Inc.",
      email: "alex@kakuu-global.invalid",
      name: "Alex Fictional",
      phone: "+1-555-0100",
      title: "Head of Partnerships",
    },
  },
  {
    caseName: "long-compound-title",
    note: "役職が長く、その内部に部署名を含む。",
    ocrLines: [
      "架空システムズ株式会社",
      "執行役員 兼 プロダクト統括本部長",
      "統合 二子",
      "03-5555-0108",
    ],
    expected: {
      ...empty,
      company: "架空システムズ株式会社",
      name: "統合 二子",
      phone: "03-5555-0108",
      title: "執行役員 兼 プロダクト統括本部長",
    },
    alternatives: {
      department: ["プロダクト統括本部"],
    },
  },
  {
    caseName: "kyujitai-name",
    note: "旧字体・異体字。可視の字形を保持し新字体に置き換えないこと。",
    ocrLines: [
      "架空繊維株式會社",
      "総務部 部長代理",
      "髙嶋 三子",
      "takashima@kakuu-textile.invalid",
    ],
    expected: {
      ...empty,
      company: "架空繊維株式會社",
      department: "総務部",
      email: "takashima@kakuu-textile.invalid",
      name: "髙嶋 三子",
      title: "部長代理",
    },
  },
  {
    caseName: "url-without-scheme",
    note: "スキームなしURL。可視の表記のまま保持。",
    ocrLines: [
      "架空フーズ株式会社",
      "商品開発部",
      "開発 四子",
      "kakuu-foods.invalid",
    ],
    expected: {
      ...empty,
      company: "架空フーズ株式会社",
      department: "商品開発部",
      name: "開発 四子",
      website: "kakuu-foods.invalid",
    },
  },
  {
    caseName: "mobile-only",
    note: "携帯のみ。固定電話がない。",
    ocrLines: ["架空コンサルティング", "代表", "相談 五子", "090-5555-0109"],
    expected: {
      ...empty,
      company: "架空コンサルティング",
      name: "相談 五子",
      phone: "090-5555-0109",
      title: "代表",
    },
  },
  {
    caseName: "name-with-furigana",
    note: "氏名にふりがな行が付く。ふりがなを氏名に混ぜないこと。",
    ocrLines: [
      "架空メディカル株式会社",
      "臨床開発部 主席研究員",
      "かくう ろくこ",
      "架空 六子",
      "rokuko@kakuu-medical.invalid",
    ],
    expected: {
      ...empty,
      company: "架空メディカル株式会社",
      department: "臨床開発部",
      email: "rokuko@kakuu-medical.invalid",
      name: "架空 六子",
      title: "主席研究員",
    },
  },
  {
    caseName: "department-hierarchy",
    note: "部署が2階層。両方を保持できるか。",
    ocrLines: ["架空物流株式会社", "営業本部 第一営業部", "係長", "運送 七子"],
    expected: {
      ...empty,
      company: "架空物流株式会社",
      department: "営業本部 第一営業部",
      name: "運送 七子",
      title: "係長",
    },
  },
  {
    caseName: "title-before-name-same-line",
    note: "役職と氏名が同一行。氏名だけを切り出せるか。",
    ocrLines: [
      "架空エナジー株式会社",
      "技術統括部",
      "部長 電力 八子",
      "03-5555-0110",
    ],
    expected: {
      ...empty,
      company: "架空エナジー株式会社",
      department: "技術統括部",
      name: "電力 八子",
      phone: "03-5555-0110",
      title: "部長",
    },
  },
];
