// Gallery for the 2026-09 redesign, at /redesign.
//
// Same idea as /preview: mock data, no backend, so the new visuals can be
// judged on a device while the screens are still being built.
import { colors, radius, spacing, typography } from "@miraio/ui-tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  AnalysisPrepScreen,
  AnalysisResultScreen,
  CaptureChromeScreen,
  ConversationLogScreen,
  HomeScreen,
  PersonSummaryScreen,
  WelcomeScreen,
  analysisTabs,
  type AnalysisResult,
  type AnalysisTab,
  type HomeFilter,
  type NextActionItem,
  type OwnContext,
  type PersonListItem,
  type PersonSummary,
} from "../components/redesign-screens";

const person: PersonSummary = {
  avatarUri: null,
  company: "株式会社Example",
  department: "営業部 部長",
  headlines: [
    { date: "2024/04", text: "IT系展示会に出展" },
    { date: "2024/03", text: "新サービスのリリースを発表" },
  ],
  keywords: ["SaaS", "営業", "マネジメント", "DX", "展示会"],
  name: "山田 太郎",
  nameRoman: "Taro Yamada",
  summary:
    "株式会社Exampleの営業部部長。法人向けSaaSの提案営業を統括。展示会やイベントにも積極的に参加し、新しいサービスや人脈に関心が高い。",
};

const ownContext: OwnContext = {
  company: "株式会社Miraio",
  interests: ["生成AI", "SaaS", "業務改善", "データ分析"],
  offers: ["技術力", "学生視点", "開発リソース", "情報改革"],
  role: "学生エンジニア / インターン",
  skills: ["Python", "AI", "機械学習", "Web開発"],
  wants: ["実務経験", "ビジネス知識", "人脈", "フィードバック"],
};

const analysis: AnalysisResult = {
  bridgeItems: [
    "AIを活用した営業効率化について情報交換ができる",
    "学生向けのSaaS活用アイデアを一緒に考えられる",
    "将来的にプロダクト開発や検証で協力できる可能性がある",
    "あなたの技術力が、相手の事業成長に貢献できる可能性がある",
  ],
  bridgeThemes: ["AI × 営業の未来", "SaaSのユーザー還元", "学生エンジニアのキャリア"],
  compatibility: 82,
  compatibilityNote: "お互いに価値を提供し合える可能性が高い相手です。",
  compatibilityVerdict: "高い相性です！",
  getItems: [
    "SaaS業界の知見やトレンド",
    "営業・ビジネスの実務知識",
    "キャリアや働き方のアドバイス",
    "将来のインターンや採用の可能性",
  ],
  giveItems: [
    "AI・Web開発の知識や技術",
    "学生視点でのユーザーインサイト",
    "最新のAIトレンドや情報",
    "プロジェクト協力の可能性",
  ],
  questions: [
    "現在の営業で、AIやSaaSを活用して特に効果が出ている取り組みはありますか？",
    "新しいサービスを導入する際に、一番課題になるポイントはどこですか？",
    "学生エンジニアに期待することや、一緒に取り組めることはありますか？",
  ],
  speakingTip:
    "まずは相手の課題や取り組みについて質問し、共感を示しながら自分の強みを自然に伝えましょう。",
};

const people: PersonListItem[] = [
  {
    avatarUri: null,
    badge: "要フォロー",
    company: "株式会社Example",
    department: "営業部 部長",
    id: "1",
    name: "山田 太郎",
    score: 82,
    updatedAt: "5分前",
  },
  {
    avatarUri: null,
    badge: null,
    company: "株式会社Example",
    department: "マーケティング部",
    id: "2",
    name: "佐藤 花子",
    score: 71,
    updatedAt: "2日前",
  },
  {
    avatarUri: null,
    badge: null,
    company: "株式会社Tech",
    department: "開発部 マネージャー",
    id: "3",
    name: "鈴木 健一",
    score: 66,
    updatedAt: "3日前",
  },
];

const initialActions: NextActionItem[] = [
  { done: true, label: "お礼メールを送る（今日中）" },
  { done: false, label: "自分のポートフォリオを送る（3日以内）" },
  { done: false, label: "AI活用事例の資料を共有する（1週間以内）" },
];

const screens = [
  "ウェルカム",
  "撮影",
  "人物サマリー",
  "分析の準備",
  "分析結果",
  "会話を記録",
  "ホーム",
] as const;

type ScreenName = (typeof screens)[number];

export default function RedesignGallery() {
  const [active, setActive] = useState<ScreenName>("ウェルカム");
  const [tab, setTab] = useState<AnalysisTab>(analysisTabs[0]);
  const [filter, setFilter] = useState<HomeFilter>("すべて");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState(
    "営業のDXに課題を感じており、特にデータ分析とAI活用に興味があるとのこと。\n学生との協業やインターンにも前向き。\n次回、具体的な事例や自分のプロジェクトを紹介することになった。",
  );
  const [actions, setActions] = useState<NextActionItem[]>(initialActions);

  function toggleAction(index: number) {
    setActions((current) =>
      current.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item,
      ),
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Text style={styles.barLabel}>REDESIGN（モックデータ・開発用）</Text>
        <View style={styles.tabs}>
          {screens.map((name) => (
            <Pressable
              key={name}
              onPress={() => setActive(name)}
              style={[styles.tab, active === name && styles.tabActive]}
            >
              <Text
                style={[styles.tabText, active === name && styles.tabTextActive]}
              >
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {active === "ウェルカム" ? (
          <WelcomeScreen onStart={() => setActive("撮影")} />
        ) : null}

        {active === "撮影" ? (
          <CaptureChromeScreen
            onClose={() => setActive("ホーム")}
            onShutter={() => setActive("人物サマリー")}
          />
        ) : null}

        {active === "人物サマリー" ? (
          <PersonSummaryScreen
            onBack={() => setActive("ホーム")}
            onStartAnalysis={() => setActive("分析の準備")}
            person={person}
          />
        ) : null}

        {active === "分析の準備" ? (
          <AnalysisPrepScreen
            context={ownContext}
            onBack={() => setActive("人物サマリー")}
            onRun={() => setActive("分析結果")}
            purpose="情報交換 / 将来的な協業の可能性"
            situation="展示会での出会い"
          />
        ) : null}

        {active === "分析結果" ? (
          <AnalysisResultScreen
            onBack={() => setActive("分析の準備")}
            onTabChange={setTab}
            result={analysis}
            tab={tab}
          />
        ) : null}

        {active === "会話を記録" ? (
          <ConversationLogScreen
            actions={actions}
            note={note}
            onBack={() => setActive("分析結果")}
            onChangeNote={setNote}
            onToggleAction={toggleAction}
            reminder="2024/05/20（月）18:00"
          />
        ) : null}

        {active === "ホーム" ? (
          <HomeScreen
            filter={filter}
            items={people}
            onChangeFilter={setFilter}
            onChangeSearch={setSearch}
            onOpenPerson={() => setActive("人物サマリー")}
            search={search}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingTop: spacing.lg,
  },
  barLabel: {
    ...typography.micro,
    color: colors.muted,
    letterSpacing: 1,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  body: { flex: 1 },
  root: { backgroundColor: colors.background, flex: 1 },
  tab: {
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { ...typography.captionStrong, color: colors.muted },
  tabTextActive: { color: colors.onAccent },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
