// Opt-in development gallery. Uses synthetic content and never calls an API.
import type {
  FlashBriefPublic,
  MeetingGoal,
  MutualValuePublic,
  PersonalContextResponse,
  ScanHistoryItem,
} from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnalysisPreparationScreen } from "../components/analysis-preparation-screen";
import { CameraFrame } from "../components/camera-frame";
import { HomeScreen } from "../components/home-screen";
import {
  FlashBriefScreen,
  InteractionScreen,
  MutualValueScreen,
} from "../components/relationship-screens";
import { WelcomeScreen } from "../components/welcome-screen";
import { ScreenFrame, TextButton } from "../components/ui";

const person = {
  name: "デモ 太郎",
  company: "株式会社サンプル",
  title: "営業部 部長",
};
const brief: FlashBriefPublic = {
  identity_status: "unresolved",
  who: "株式会社サンプルの営業部長。法人向けSaaSの提案営業を担当。展示会やイベントでの情報交換を大切にしています。",
  why_you: "AI・Web開発の知識と、営業現場の経験を交換できる可能性があります。",
  potential:
    "お互いの強みを持ち寄り、新しいサービスのアイデアを一緒に考えられそうです。",
  say_this: ["今、営業の現場でどんな課題がありますか？"],
};
const value: MutualValuePublic = {
  give: [
    "AI・Web開発の知識や技術",
    "学生視点でのユーザーインサイト",
    "最新のAIトレンドや情報",
    "プロジェクト協力の可能性",
  ].map((text) => ({ text, claim_type: "hypothesis", evidence_ids: [] })),
  get: [
    "SaaS業界の知見やトレンド",
    "営業・ビジネスの実務知識",
    "キャリアや働き方のアドバイス",
    "インターンや採用の可能性",
  ].map((text) => ({ text, claim_type: "hypothesis", evidence_ids: [] })),
  bridge:
    "AIを活用した営業効率化について情報交換ができそうです。\n\n学生向けのSaaS活用アイデアを一緒に考えられます。\n\n将来的なプロダクト開発や検証で協力できる可能性があります。",
  ask: [
    {
      question:
        "現在の営業で、AIやSaaSを活用して特に効果が出ている取り組みはありますか？",
      validates_hypothesis: null,
    },
    {
      question:
        "新しいサービスを導入する際に、一番課題になるポイントはどこですか？",
      validates_hypothesis: null,
    },
    {
      question:
        "学生エンジニアに期待することや、一緒に取り組めることはありますか？",
      validates_hypothesis: null,
    },
  ],
  next_action: {
    action: "お礼メールを送る",
    timing: "今日中",
    reason: "会話で見つけた接点に触れ、次の情報交換につなげましょう。",
  },
};
const context: PersonalContextResponse = {
  profile: {
    current_company: "株式会社サンプルラボ",
    current_role: "学生エンジニア / インターン",
  },
  items: [
    { type: "strong_skill", text: "Python" },
    { type: "strong_skill", text: "AI" },
    { type: "strong_skill", text: "機械学習" },
    { type: "strong_skill", text: "Web開発" },
    { type: "current_theme", text: "生成AI" },
    { type: "current_theme", text: "SaaS" },
    { type: "current_theme", text: "業務改善" },
    { type: "current_theme", text: "データ分析" },
    { type: "offer", text: "技術力" },
    { type: "offer", text: "学生視点" },
    { type: "offer", text: "開発リソース" },
    { type: "seeking", text: "業務経験" },
    { type: "seeking", text: "ビジネス知識" },
    { type: "seeking", text: "フィードバック" },
  ].map((item, i) => ({
    ...item,
    type: item.type as PersonalContextResponse["items"][number]["type"],
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    tags: [],
    source_type: "user_entered",
    user_approved: true,
    created_at: "2026-09-03",
    updated_at: "2026-09-03",
  })),
};
const demoHistory: ScanHistoryItem[] = [
  "デモ 太郎",
  "サンプル 花子",
  "テスト 健一",
].map((name, i) => ({
  scan_id: `00000000-0000-4000-8000-${String(i + 30).padStart(12, "0")}`,
  card_name: name,
  card_company: "株式会社サンプル",
  card_title:
    ["営業部 部長", "マーケティング部", "開発部 マネージャー"][i] || null,
  created_at: `2026-09-0${3 - i}T09:00:00+09:00`,
  meeting_goal: "networking",
  status: i === 1 ? "deep_enrichment" : "deep_ready",
}));
const screens = [
  "welcome",
  "camera",
  "summary",
  "preparation",
  "give-get",
  "bridge",
  "conversation",
  "note",
  "home",
] as const;
const titles = [
  "開始",
  "名刺を撮影",
  "人物サマリー",
  "分析の準備",
  "GIVE / GET",
  "BRIDGE",
  "会話提案",
  "会話を記録",
  "ホーム",
];

function DemoScreen({ initial }: { initial: string }) {
  const [screen, setScreen] = useState(initial);
  const [goal, setGoal] = useState<MeetingGoal>("networking");
  const [torch, setTorch] = useState(false);
  const [history, setHistory] = useState(demoHistory);
  const [notice, setNotice] = useState("");
  const home = () => setScreen("home");
  const summary = () => setScreen("summary");
  const noOp = async () => {};
  if (screen === "welcome")
    return <WelcomeScreen onStart={home} onLogin={home} />;
  if (screen === "camera")
    return (
      <CameraFrame
        onBack={home}
        onGallery={() => setNotice("写真選択の外観プレビューです")}
        onToggleTorch={() => setTorch(!torch)}
        onCapture={summary}
        torch={torch}
        disabled={false}
        capturing={false}
        error={notice || null}
      >
        <View style={s.demoCamera}>
          <View style={s.demoCard}>
            <Text style={s.demoCompany}>株式会社サンプル</Text>
            <Text style={s.demoName}>デモ 太郎</Text>
            <Text>営業部 部長</Text>
            <Text style={s.demoCaption}>架空の名刺 · UI確認用</Text>
          </View>
        </View>
      </CameraFrame>
    );
  if (screen === "summary")
    return (
      <FlashBriefScreen
        brief={brief}
        card={person}
        deepEnriching={false}
        error={null}
        onDone={home}
        onRefresh={noOp}
        onViewCard={() => setScreen("detail")}
        onViewEvidence={() => setScreen("detail")}
        onViewMutualValue={() => setScreen("preparation")}
        onViewInteraction={() => setScreen("note")}
      />
    );
  if (screen === "preparation")
    return (
      <AnalysisPreparationScreen
        context={context}
        meetingGoal={goal}
        onMeetingGoalChange={setGoal}
        onEdit={() => setScreen("detail")}
        onBack={summary}
        onContinue={() => setScreen("give-get")}
        captured
      />
    );
  if (screen === "give-get" || screen === "bridge" || screen === "conversation")
    return (
      <MutualValueScreen
        card={person}
        error={null}
        mutualValue={value}
        potential={brief.potential}
        themes={["生成AI", "SaaS", "業務改善", "データ分析"]}
        onDone={home}
        onRefresh={noOp}
        onViewBrief={summary}
        onViewInteraction={() => setScreen("note")}
        initialTab={screen}
      />
    );
  if (screen === "note")
    return (
      <InteractionScreen
        card={person}
        error={null}
        mutualValue={value}
        onAcceptNextAction={noOp}
        onDismissNextAction={noOp}
        onSaveNote={noOp}
        onDone={home}
        onViewMutualValue={() => setScreen("give-get")}
      />
    );
  if (screen === "home")
    return (
      <HomeScreen
        items={history}
        error={null}
        onRefresh={() => setHistory(demoHistory)}
        onOpenScan={summary}
        onDeleteScan={async (id) =>
          setHistory((items) => items.filter((item) => item.scan_id !== id))
        }
        onCapture={() => setScreen("camera")}
        onProfile={() => setScreen("preparation")}
      />
    );
  return (
    <ScreenFrame title="プレビュー" onBack={summary}>
      <Text>詳細情報は本番のデータに接続されます。</Text>
      <TextButton label="人物サマリーに戻る" onPress={summary} />
    </ScreenFrame>
  );
}

export default function UiPreview() {
  const { screen } = useLocalSearchParams<{ screen?: string }>();
  if (!__DEV__ || process.env.EXPO_PUBLIC_ENABLE_UI_PREVIEW !== "1")
    return <Redirect href="/" />;
  if (screen)
    return (
      <SafeAreaView style={s.fill}>
        <DemoScreen key={screen} initial={screen} />
      </SafeAreaView>
    );
  return (
    <ScrollView contentContainerStyle={s.gallery}>
      <Text style={s.galleryTitle}>Miraio Lens — UI確認用（架空データ）</Text>
      <View style={s.grid}>
        {screens.map((item, i) => (
          <View key={item} style={s.tile}>
            <Text style={s.tileLabel}>{titles[i]}</Text>
            <View style={s.phone}>
              <DemoScreen initial={item} />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  gallery: { backgroundColor: "#F0EDF5", padding: 24, alignItems: "center" },
  galleryTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    paddingBottom: 24,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 20, maxWidth: 1165 },
  tile: { gap: 10, width: 375 },
  tileLabel: { fontSize: 13, color: colors.muted },
  phone: {
    height: 812,
    width: 375,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E1DAED",
    backgroundColor: colors.background,
  },
  demoCamera: {
    flex: 1,
    backgroundColor: "#765033",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  demoCard: {
    width: "100%",
    aspectRatio: 1.55,
    padding: 20,
    backgroundColor: "#F6F5F0",
    justifyContent: "center",
    gap: 10,
  },
  demoCompany: { fontSize: 12 },
  demoName: { fontSize: 23, fontWeight: "600" },
  demoCaption: { fontSize: 10, color: colors.muted, paddingTop: 10 },
});
