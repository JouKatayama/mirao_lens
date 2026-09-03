// Development-only screen gallery.
//
// Renders every scan screen against in-file mock data so the whole UI can be
// reviewed without Supabase, the API, or an OpenAI key. Reachable at /preview.
// Not linked from the app; delete this file to remove the harness.
import type {
  EvidenceItem,
  FlashBriefPublic,
  MeetingGoal,
  MutualValuePublic,
  PersonalContextProfile,
  ScanCreateResponse,
  ScanHistoryItem,
  ScanStatusResponse,
} from "@miraio/domain";
import { colors, spacing } from "@miraio/ui-tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  CardCaptureScreen,
  CardIntelligenceScreen,
  EvidenceScreen,
  FlashBriefScreen,
  HistoryScreen,
  HomeScanScreen,
  InteractionScreen,
  MutualValueScreen,
} from "../components/card-scan-screens";

const SCAN_ID = "11111111-2222-4333-8444-555555555555";

const profile: PersonalContextProfile = {
  current_company: "架空コンサルティング合同会社",
  current_role: "シニアコンサルタント",
};

const card = {
  address: "東京都千代田区架空町1-2-3",
  claims: [
    {
      claim_type: "fact" as const,
      confidence: 0.97,
      field: "name" as const,
      source_type: "business_card" as const,
      value: "山田 太郎",
    },
    {
      claim_type: "fact" as const,
      confidence: 0.94,
      field: "company" as const,
      source_type: "business_card" as const,
      value: "架空テクノロジー株式会社",
    },
  ],
  company: "架空テクノロジー株式会社",
  department: "経営企画本部",
  email: "y.taro@example.co.jp",
  field_confidence: {
    address: 0.71,
    company: 0.94,
    department: 0.83,
    email: 0.9,
    name: 0.97,
    phone: 0.88,
    title: 0.86,
    website: 0.79,
  },
  language: "ja",
  name: "山田 太郎",
  phone: "090-1234-5678",
  title: "AI推進責任者",
  user_corrected: false,
  website: "https://www.example.co.jp",
};

const cardSummary = {
  company: card.company,
  name: card.name,
  title: card.title,
};

const flashBrief: FlashBriefPublic = {
  identity_status: "high_confidence",
  potential:
    "製造業DXの実装経験と、相手のAI推進役割が噛み合う。全社展開の進め方で具体的な議論ができる余地が大きい。",
  say_this: [
    "生成AIの導入で、いま一番難しいのはどの工程ですか？",
    "現場から経営層に上げるときの合意形成はどうされていますか？",
  ],
  who: "架空テクノロジー株式会社でAI推進責任者を務め、経営企画本部に所属。",
  why_you:
    "あなたの製造業向けDX 5年の経験と、相手のAI全社展開のフェーズが重なる。",
};

const mutualValue: MutualValuePublic = {
  ask: [
    {
      question: "AI活用の内製化と外部委託、どちらに寄せていますか？",
      validates_hypothesis: "全社展開フェーズで内製化を模索している",
    },
    {
      question: "経営層への効果報告はどの指標で行っていますか？",
      validates_hypothesis: null,
    },
  ],
  bridge:
    "あなたの実装力と相手の推進力を組み合わせると、AI活用を事業成果につなげる流れが作れる。",
  get: [
    {
      claim_type: "fact",
      evidence_ids: [],
      text: "AI推進の実務知見と、社内展開でつまずいた事例",
    },
    {
      claim_type: "hypothesis",
      evidence_ids: [],
      text: "組織変革を進める立場からの視点と、関連部門のネットワーク",
    },
  ],
  give: [
    {
      claim_type: "fact",
      evidence_ids: [],
      text: "製造業での生成AI活用事例と、導入時のつまずきどころ",
    },
    {
      claim_type: "hypothesis",
      evidence_ids: [],
      text: "現場定着まで見据えた導入支援のフレームワーク",
    },
  ],
  next_action: {
    action: "製造業での生成AI導入事例を3件まとめて共有する",
    reason: "相手が全社展開の進め方を探しており、具体例が判断材料になる。",
    timing: "3日以内",
  },
};

const status: ScanStatusResponse = {
  card,
  error_code: null,
  flash_brief: flashBrief,
  mutual_value: mutualValue,
  scan_id: SCAN_ID,
  status: "deep_ready",
};

const scanResult: ScanCreateResponse = {
  scan_id: SCAN_ID,
  status: "extracting",
};

const evidence: EvidenceItem[] = [
  {
    confidence: 0.97,
    excerpt: "山田 太郎 / AI推進責任者",
    id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    retrieved_at: null,
    source_title: "受け取った名刺",
    source_type: "business_card",
    source_url: null,
  },
  {
    confidence: 0.82,
    excerpt: "2026年より全社でのAI活用推進を開始",
    id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
    retrieved_at: "2026-09-01T04:00:00.000Z",
    source_title: "架空テクノロジー株式会社 ニュースリリース",
    source_type: "official_company",
    source_url: "https://www.example.co.jp/news/ai",
  },
  {
    confidence: 0.55,
    excerpt: "全社展開フェーズにあると推測される",
    id: "cccccccc-3333-4333-8333-cccccccccccc",
    retrieved_at: null,
    source_title: null,
    source_type: "ai_inference",
    source_url: null,
  },
];

const history: ScanHistoryItem[] = [
  {
    card_company: "架空テクノロジー株式会社",
    card_name: "山田 太郎",
    card_title: "AI推進責任者",
    created_at: "2026-09-03T10:20:00.000Z",
    meeting_goal: "partnership",
    scan_id: SCAN_ID,
    status: "deep_ready",
  },
  {
    card_company: "サンプル商事株式会社",
    card_name: "佐藤 花子",
    card_title: "事業開発マネージャー",
    created_at: "2026-09-01T02:05:00.000Z",
    meeting_goal: "networking",
    scan_id: "99999999-8888-4777-8666-555555555555",
    status: "brief_ready",
  },
  {
    card_company: null,
    card_name: null,
    card_title: null,
    created_at: "2026-08-30T23:40:00.000Z",
    meeting_goal: "sales",
    scan_id: "77777777-6666-4555-8444-333333333333",
    status: "failed",
  },
];

const noop = () => {};
const asyncNoop = async () => {};

// Stands in for the real upload. Resolves after a beat so the screen's
// uploading state is visible, then reports the mock scan as accepted.
const fakeUpload = async () => {
  await new Promise((resolve) => setTimeout(resolve, 900));
  return scanResult;
};

const screens = [
  "ホーム",
  "撮影",
  "名刺の読み取り結果",
  "Flash Brief",
  "Mutual Value",
  "会話メモ",
  "根拠",
  "履歴",
] as const;

type ScreenName = (typeof screens)[number];

export default function PreviewScreen() {
  const [active, setActive] = useState<ScreenName>("ホーム");
  const [meetingGoal, setMeetingGoal] = useState<MeetingGoal>("partnership");

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Text style={styles.barLabel}>PREVIEW（モックデータ・開発用）</Text>
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
        {active === "ホーム" ? (
          <HomeScanScreen
            contextItemCount={7}
            meetingGoal={meetingGoal}
            onMeetingGoalChange={setMeetingGoal}
            onOpenContext={noop}
            onSignOut={asyncNoop}
            onStartCapture={noop}
            onViewHistory={() => setActive("履歴")}
            profile={profile}
          />
        ) : null}

        {active === "撮影" ? (
          <CardCaptureScreen
            onAccepted={() => setActive("名刺の読み取り結果")}
            onBack={() => setActive("ホーム")}
            onUpload={fakeUpload}
            scanId={SCAN_ID}
          />
        ) : null}

        {active === "名刺の読み取り結果" ? (
          <CardIntelligenceScreen
            error={null}
            onCorrect={asyncNoop}
            onDone={() => setActive("Flash Brief")}
            onRecapture={noop}
            onRefresh={asyncNoop}
            onRetry={asyncNoop}
            result={scanResult}
            status={status}
          />
        ) : null}

        {active === "Flash Brief" ? (
          <FlashBriefScreen
            brief={flashBrief}
            card={cardSummary}
            deepEnriching={false}
            error={null}
            onDone={noop}
            onRefresh={asyncNoop}
            onViewCard={() => setActive("名刺の読み取り結果")}
            onViewEvidence={() => setActive("根拠")}
            onViewMutualValue={() => setActive("Mutual Value")}
          />
        ) : null}

        {active === "Mutual Value" ? (
          <MutualValueScreen
            card={cardSummary}
            error={null}
            mutualValue={mutualValue}
            onDone={noop}
            onRefresh={asyncNoop}
            onViewBrief={() => setActive("Flash Brief")}
            onViewInteraction={() => setActive("会話メモ")}
          />
        ) : null}

        {active === "会話メモ" ? (
          <InteractionScreen
            card={cardSummary}
            error={null}
            mutualValue={mutualValue}
            onAcceptNextAction={asyncNoop}
            onDismissNextAction={asyncNoop}
            onDone={noop}
            onSaveNote={asyncNoop}
            onViewMutualValue={() => setActive("Mutual Value")}
          />
        ) : null}

        {active === "根拠" ? (
          <EvidenceScreen
            card={cardSummary}
            error={null}
            items={evidence}
            onBack={() => setActive("Flash Brief")}
          />
        ) : null}

        {active === "履歴" ? (
          <HistoryScreen
            error={null}
            items={history}
            onBack={() => setActive("ホーム")}
            onDeleteScan={asyncNoop}
            onOpenScan={() => setActive("Flash Brief")}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#D7E0DB",
    borderBottomWidth: 1,
    paddingTop: spacing.lg,
  },
  barLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  body: { flex: 1 },
  root: { backgroundColor: colors.background, flex: 1 },
  tab: {
    borderRadius: 999,
    // 44pt minimum touch target (Apple HIG / Material) so the tabs stay
    // tappable on a phone rather than only with a mouse.
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#FFFFFF" },
});
