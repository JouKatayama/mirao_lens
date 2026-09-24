// Synthetic UI flow for the public demo route and opt-in development gallery.
// It never calls an API.
import type {
  EncounterHistoryItem,
  EvidenceItem,
  FlashBriefPublic,
  MeetingGoal,
  MutualValuePublic,
  NextActionResponse,
  PersonalContextResponse,
  ScanHistoryItem,
} from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { Redirect, useLocalSearchParams, usePathname } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnalysisPreparationScreen } from "../components/analysis-preparation-screen";
import { CameraFrame } from "../components/camera-frame";
import { EncounterHistoryScreen } from "../components/encounter-history-screen";
import { ReanalysisScreen } from "../components/reanalysis-screen";
import {
  CardCaptureScreen,
  EvidenceScreen,
} from "../components/card-scan-screens";
import { HomeScreen } from "../components/home-screen";
import { OnboardingScreen } from "../components/personal-context-screens";
import { ProcessingDemoScreen } from "../components/processing-demo-screen";
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
  connection_keywords: ["AI活用", "営業DX", "学生エンジニア"],
  identity_status: "unresolved",
  who: "株式会社サンプルの営業部長。法人向けSaaSの提案営業を担当。展示会やイベントでの情報交換を大切にしています。",
  why_you: "AI・Web開発の知識と、営業現場の経験を交換できる可能性があります。",
  why_you_claim_type: "hypothesis",
  potential:
    "お互いの強みを持ち寄り、新しいサービスのアイデアを一緒に考えられそうです。",
  potential_score: 4,
  say_this: ["今、営業の現場でどんな課題がありますか？"],
};
// The same screen with the longest text the contracts allow: a wrapped
// question must stay whole and inside the first view, not be clipped to fit.
const longPerson = {
  name: "デモ 太郎左衛門",
  company: "サンプルホールディングス株式会社",
  title: "デジタルトランスフォーメーション推進本部 副本部長",
};
const longBrief: FlashBriefPublic = {
  connection_keywords: [
    "生成AIの社内展開",
    "営業DX",
    "データ基盤",
    "学生エンジニア",
  ],
  identity_status: "medium_confidence",
  who: "サンプルホールディングス株式会社でデジタル推進を担当。全社の業務プロセス改善と、現場に定着するデータ活用の仕組みづくりに取り組んでいます。",
  why_you:
    "生成AIの社内展開という同じテーマに取り組んでおり、現場で定着させるための進め方について、実際の経験を交換できる可能性があります。",
  why_you_claim_type: "hypothesis",
  potential:
    "全社展開の知見と、実装まで踏み込める技術の組み合わせは、どちらの取り組みも前に進める可能性があります。",
  potential_score: 5,
  say_this: [
    "生成AIを全社に広げるうえで、現場に定着させるために一番工夫されたことは何ですか？",
  ],
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
  is_favorite: i === 0,
  card_name: name,
  card_company: "株式会社サンプル",
  card_title:
    ["営業部 部長", "マーケティング部", "開発部 マネージャー"][i] || null,
  created_at: `2026-09-0${3 - i}T09:00:00+09:00`,
  meeting_goal: "networking",
  status: i === 1 ? "deep_enrichment" : "deep_ready",
}));
const demoEncounters: EncounterHistoryItem[] = [
  {
    created_at: "2026-08-20T04:00:00.000Z",
    meeting_goal: "networking",
    note_excerpt:
      "生成AIの社内展開で悩んでいるとのこと。事例を送る約束をした。",
    scan_id: "00000000-0000-4013-8000-0000000009a1",
  },
  {
    created_at: "2026-06-02T02:30:00.000Z",
    meeting_goal: "learning_information_exchange",
    note_excerpt: null,
    scan_id: "00000000-0000-4013-8000-0000000009a2",
  },
];
const demoEvidence: EvidenceItem[] = [
  {
    confidence: 0.92,
    excerpt: "名前: デモ 太郎 / 会社: 株式会社サンプル / 役職: 営業部 部長",
    id: "00000000-0000-4013-8000-0000000009c1",
    retrieved_at: "2026-09-11T01:00:00.000Z",
    source_title: "card.name",
    source_type: "business_card",
    source_url: null,
  },
  {
    confidence: 0.7,
    excerpt: "会社概要 | 株式会社サンプル",
    id: "00000000-0000-4013-8000-0000000009c2",
    retrieved_at: "2026-09-11T01:00:00.000Z",
    source_title: "example.invalid",
    source_type: "official_company",
    source_url: "https://example.invalid/company",
  },
  {
    confidence: 0.55,
    excerpt: "サンプル社、法人向けSaaSの新機能を発表",
    id: "00000000-0000-4013-8000-0000000009c3",
    retrieved_at: "2026-09-11T01:00:00.000Z",
    source_title: "news.invalid",
    source_type: "public_web",
    source_url: "https://news.invalid/articles/1",
  },
];
const demoRecordedActions: NextActionResponse[] = [
  {
    action_text: "生成AI導入の事例資料を共有する",
    due_at: "2026-09-14T00:00:00.000Z",
    id: "00000000-0000-4013-8000-0000000009b1",
    scan_id: "00000000-0000-4013-8000-0000000009b0",
    source: "ai",
    status: "accepted",
    timing_text: "3日以内",
  },
  {
    action_text: "前回話した勉強会に招待する",
    due_at: null,
    id: "00000000-0000-4013-8000-0000000009b2",
    scan_id: "00000000-0000-4013-8000-0000000009b0",
    source: "user",
    status: "completed",
    timing_text: null,
  },
];
const screens = [
  "welcome",
  "onboarding",
  "pc-upload",
  "camera",
  "processing",
  "summary",
  "summary-long",
  "preparation",
  "give-get",
  "bridge",
  "conversation",
  "note",
  "note-revisit",
  "encounters",
  "evidence",
  "reanalysis",
  "home",
] as const;
const titles = [
  "開始",
  "プロフィール登録",
  "PC画像選択",
  "名刺を撮影",
  "処理中",
  "人物サマリー",
  "人物サマリー（長文）",
  "分析の準備",
  "GIVE / GET",
  "BRIDGE",
  "会話提案",
  "会話を記録",
  "会話を記録（再訪）",
  "これまでの接点",
  "根拠・ソース",
  "面談ゴール変更",
  "ホーム",
];

function DemoScreen({ initial }: { initial: string }) {
  const [screen, setScreen] = useState(initial);
  const [goal, setGoal] = useState<MeetingGoal>("networking");
  const [torch, setTorch] = useState(false);
  const [history, setHistory] = useState(demoHistory);
  const [notice, setNotice] = useState("");
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const [demoActions, setDemoActions] = useState<NextActionResponse[]>([]);
  const home = () => setScreen("home");
  const summary = () => setScreen("summary");
  const noOp = async () => {};
  // Demo changes live only in memory. Nothing is sent to a server or scheduled.
  const saveDemoAction = async (
    actionText: string,
    timingText: string | null,
    dueAt: string | null,
  ) => {
    setDemoActions([
      {
        action_text: actionText,
        due_at: dueAt,
        id: "00000000-0000-4000-8000-000000000027",
        scan_id: "00000000-0000-4000-8000-000000000026",
        source: "ai",
        status: "accepted",
        timing_text: timingText,
      },
    ]);
    return false;
  };
  if (screen === "welcome")
    return <WelcomeScreen onStart={home} onLogin={home} />;
  if (screen === "onboarding")
    return (
      <OnboardingScreen
        initialProfile={{
          current_company: "株式会社サンプル",
          current_role: "Webサービスの企画・開発",
        }}
        loading={false}
        onBack={home}
        onSubmit={async () => setScreen("home")}
      />
    );
  if (screen === "pc-upload")
    return (
      <CardCaptureScreen
        onAccepted={summary}
        onBack={home}
        onUpload={async () => ({
          scan_id: "00000000-0000-4000-8000-000000000026",
          status: "extracting",
        })}
        scanId="00000000-0000-4000-8000-000000000026"
      />
    );
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
  if (screen === "processing")
    return <ProcessingDemoScreen onBack={home} onReady={summary} />;
  if (screen === "summary" || screen === "summary-long")
    return (
      <FlashBriefScreen
        brief={screen === "summary-long" ? longBrief : brief}
        card={screen === "summary-long" ? longPerson : person}
        deepEnriching={false}
        error={null}
        onDone={home}
        onFlagIdentity={() => undefined}
        onMarkHypothesisUnhelpful={() => undefined}
        onRateUsefulness={() => undefined}
        isFavorite
        onChangeMeetingGoal={() => setScreen("reanalysis")}
        onRefresh={noOp}
        onToggleFavorite={noOp}
        onViewCard={() => setScreen("detail")}
        onViewEncounters={() => setScreen("encounters")}
        onViewEvidence={() => setScreen("detail")}
        onViewMutualValue={() => setScreen("give-get")}
        onViewInteraction={() => setScreen("note")}
        previousEncounters={0}
      />
    );
  if (screen === "preparation")
    return (
      <AnalysisPreparationScreen
        context={context}
        meetingGoal={goal}
        onMeetingGoalChange={setGoal}
        onEdit={() => setScreen("detail")}
        onBack={home}
        onContinue={() => setScreen("camera")}
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
        onAcceptNextAction={saveDemoAction}
        onBack={() => setScreen("give-get")}
        onCompleteNextAction={noOp}
        onDismissNextAction={async (actionText) => {
          setDemoActions([
            {
              action_text: actionText,
              due_at: null,
              id: "00000000-0000-4000-8000-000000000027",
              scan_id: "00000000-0000-4000-8000-000000000026",
              source: "ai",
              status: "dismissed",
              timing_text: null,
            },
          ]);
        }}
        onSaveNote={async (text) => setDemoNote(text)}
        onSayThisUsed={() => undefined}
        onDone={home}
        record={{ actions: demoActions, note: demoNote }}
        sayThis={brief.say_this}
      />
    );
  if (screen === "note-revisit")
    return (
      <InteractionScreen
        card={person}
        error={null}
        mutualValue={value}
        onAcceptNextAction={saveDemoAction}
        onBack={() => setScreen("give-get")}
        onCompleteNextAction={noOp}
        onDismissNextAction={noOp}
        onSaveNote={noOp}
        onSetNextActionReminder={async () => false}
        onDone={home}
        record={{
          actions: demoRecordedActions,
          note: "生成AIの社内展開で悩んでいるとのこと。事例を送る約束をした。",
        }}
      />
    );
  if (screen === "evidence")
    return (
      <EvidenceScreen
        card={person}
        error={notice || null}
        items={demoEvidence}
        onBack={summary}
        onOpenSource={(url) => setNotice(`ソースを開く: ${url}`)}
      />
    );
  if (screen === "reanalysis")
    return (
      <ReanalysisScreen
        card={person}
        currentGoal="networking"
        error={null}
        onBack={summary}
        onReanalyze={noOp}
      />
    );
  if (screen === "encounters")
    return (
      <EncounterHistoryScreen
        card={person}
        error={null}
        items={demoEncounters}
        onBack={summary}
        onOpenEncounter={() => setScreen("note")}
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
        hasMore
        onLoadMore={() => setNotice("次のページを読み込みます")}
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
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [demoStart, setDemoStart] = useState("home");
  const isGalleryRoute = pathname === "/ui-preview";
  if (
    isGalleryRoute &&
    (!__DEV__ || process.env.EXPO_PUBLIC_ENABLE_UI_PREVIEW !== "1")
  )
    return <Redirect href="/" />;
  if (isGalleryRoute && screen)
    return (
      <SafeAreaView style={s.fill}>
        <DemoScreen key={screen} initial={screen} />
      </SafeAreaView>
    );
  if (isGalleryRoute)
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
  const compact = width < 850;
  const demoWidth = Math.min(375, width - 32);
  const quickStarts = [
    ["ホーム", "home"],
    ["プロフィール登録", "onboarding"],
    ["名刺を撮る", "camera"],
    ["処理中", "processing"],
    ["Flash Brief", "summary"],
    ["相互価値", "give-get"],
    ["次の行動", "note"],
  ] as const;
  return (
    <ScrollView contentContainerStyle={s.demoPage}>
      <View style={[s.demoLayout, compact && s.demoLayoutCompact]}>
        <View style={[s.demoIntro, compact && s.demoIntroCompact]}>
          <Text style={s.demoBrand}>Miraio Lens</Text>
          <Text style={[s.demoEyebrow, compact && s.demoEyebrowCompact]}>
            操作できる製品モック
          </Text>
          <Text style={[s.demoHeadline, compact && s.demoHeadlineCompact]}>
            名刺交換の、その先へ。
          </Text>
          <Text
            style={[s.demoDescription, compact && s.demoDescriptionCompact]}
          >
            {compact
              ? "名刺を撮る → 接点を見る → 次の一手を残す。"
              : "名刺を撮る → 相手と自分の接点を読む → 会話後の一手を残す。画面を操作して、最初の出会いの流れを体験できます。"}
          </Text>
          <View style={[s.demoSteps, compact && s.demoStepsCompact]}>
            {quickStarts.map(([label, value], index) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label}から見る`}
                key={value}
                onPress={() => setDemoStart(value)}
                style={[
                  s.demoStep,
                  compact && s.demoStepCompact,
                  demoStart === value && s.demoStepActive,
                ]}
              >
                <Text style={s.demoStepNumber}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <Text style={s.demoStepLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {!compact ? (
            <Text style={s.demoDisclosure}>
              架空の名刺・人物情報を使用しています。入力内容はサーバーへ保存されません。
            </Text>
          ) : null}
        </View>
        <View style={[s.demoPhone, { width: demoWidth }]}>
          <DemoScreen key={demoStart} initial={demoStart} />
        </View>
        {compact ? (
          <Text style={s.demoDisclosureCompact}>
            架空の名刺・人物情報を使用しています。入力内容はサーバーへ保存されません。
          </Text>
        ) : null}
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
  demoPage: {
    alignItems: "center",
    backgroundColor: "#F6F4EE",
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  demoLayout: {
    alignItems: "center",
    flexDirection: "row",
    gap: 72,
    justifyContent: "center",
    maxWidth: 1120,
    width: "100%",
  },
  demoLayoutCompact: { flexDirection: "column", gap: 16 },
  demoIntro: { flex: 1, maxWidth: 580 },
  demoIntroCompact: { width: "100%" },
  demoBrand: { color: "#173638", fontSize: 20, fontWeight: "800" },
  demoEyebrow: {
    color: "#167A76",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 58,
  },
  demoEyebrowCompact: { marginTop: 20 },
  demoHeadline: {
    color: "#173638",
    fontSize: 43,
    fontWeight: "800",
    lineHeight: 60,
    marginTop: 16,
  },
  demoHeadlineCompact: { fontSize: 31, lineHeight: 43, marginTop: 8 },
  demoDescription: {
    color: "#4D605E",
    fontSize: 18,
    lineHeight: 31,
    marginTop: 20,
  },
  demoDescriptionCompact: { fontSize: 15, lineHeight: 24, marginTop: 8 },
  demoSteps: { gap: 8, marginTop: 34 },
  demoStepsCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 16,
  },
  demoStep: {
    alignItems: "center",
    borderBottomColor: "#DDDCD3",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 18,
    minHeight: 48,
    paddingHorizontal: 8,
  },
  demoStepCompact: {
    borderColor: "#DDDCD3",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 9,
  },
  demoStepActive: { backgroundColor: "#E2ECE7", borderRadius: 8 },
  demoStepNumber: { color: "#B96448", fontSize: 15, fontWeight: "700" },
  demoStepLabel: { color: "#173638", fontSize: 17, fontWeight: "700" },
  demoDisclosure: {
    color: "#5A6661",
    fontSize: 13,
    lineHeight: 22,
    marginTop: 30,
  },
  demoDisclosureCompact: {
    color: "#5A6661",
    fontSize: 12,
    lineHeight: 20,
    maxWidth: 375,
  },
  demoPhone: {
    backgroundColor: colors.background,
    borderColor: "#D8D8D1",
    borderRadius: 28,
    borderWidth: 8,
    height: 812,
    overflow: "hidden",
  },
});
