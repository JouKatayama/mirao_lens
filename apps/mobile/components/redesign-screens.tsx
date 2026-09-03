// Screens for the 2026-09 visual redesign.
//
// Presentational only: every screen takes its data as props and reports
// interaction through callbacks, so they can be rendered from the gallery with
// mock data before the API supplies the real thing.
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from "@miraio/ui-tokens";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

import {
  Badge,
  Card,
  CheckRow,
  Chip,
  ChipRow,
  FieldLabel,
  FilterTabs,
  NavBar,
  NoteArea,
  PrimaryButton,
  SearchField,
  SectionTitle,
  SegmentedTabs,
} from "./ui-kit";

// ─── Shared pieces ───────────────────────────────────────────────────────────

// A real donut, unlike the CSS-border approximation in ui-kit: the redesign
// leans on this shape in two places, so it is worth the SVG.
export function ScoreDonut({
  caption,
  size = 76,
  value,
}: {
  caption?: string;
  size?: number;
  value: number;
}) {
  const stroke = Math.max(5, Math.round(size * 0.1));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <View style={styles.donut}>
      <View style={{ height: size, width: size }}>
        {/* Rotating the whole Svg starts the arc at twelve o'clock. Doing it
            here rather than with Circle's rotation prop keeps react-native-svg
            from emitting an invalid DOM attribute on web. */}
        <View style={styles.donutRotate}>
          <Svg height={size} width={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke={colors.track}
              strokeWidth={stroke}
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke={colors.accent}
              strokeDasharray={`${filled} ${circumference}`}
              strokeLinecap="round"
              strokeWidth={stroke}
            />
          </Svg>
        </View>
        <View style={styles.donutCentre}>
          <Text
            style={[styles.donutValue, { fontSize: Math.round(size * 0.24) }]}
          >
            {value}%
          </Text>
        </View>
      </View>
      {caption ? (
        <Text numberOfLines={1} style={styles.donutCaption}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

function Body({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

// ─── 1. Welcome ──────────────────────────────────────────────────────────────

export function WelcomeScreen({
  onLogin,
  onStart,
}: {
  onLogin?: () => void;
  onStart?: () => void;
}) {
  return (
    <LinearGradient
      colors={[colors.splashTop, colors.splashBottom]}
      style={styles.welcome}
    >
      <View style={styles.welcomeCentre}>
        <View style={styles.logoMark}>
          <Text style={styles.logoGlyph}>a</Text>
        </View>
        <Text style={styles.welcomeTitle}>Miraio Lens</Text>
        <Text style={styles.welcomeTagline}>
          人との出会いを、未来の価値に変える。
        </Text>
      </View>

      <View style={styles.welcomeActions}>
        <PrimaryButton label="はじめる" onPress={onStart} />
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onLogin}>
          <Text style={styles.welcomeLink}>ログインする</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

// ─── 2. Capture ──────────────────────────────────────────────────────────────

// The live camera stays in card-scan-screens; this renders the chrome the
// redesign puts around it so the framing can be judged on a device.
export function CaptureChromeScreen({
  onClose,
  onPickImage,
  onShutter,
  onToggleFlash,
  preview,
}: {
  onClose?: () => void;
  onPickImage?: () => void;
  onShutter?: () => void;
  onToggleFlash?: () => void;
  preview?: ReactNode;
}) {
  return (
    <View style={styles.capture}>
      <View style={styles.captureHeader}>
        <Pressable
          accessibilityLabel="閉じる"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onClose}
          style={styles.captureClose}
        >
          <Ionicons color={colors.textOnDark} name="close" size={26} />
        </Pressable>
        <View>
          <Text style={styles.captureTitle}>名刺を撮影</Text>
          <Text style={styles.captureSubtitle}>
            名刺を枠内に合わせてください
          </Text>
        </View>
      </View>

      <View style={styles.captureStage}>
        {preview ?? <View style={styles.capturePlaceholder} />}
        <View pointerEvents="none" style={styles.guide}>
          <View style={styles.guideFrame}>
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
        </View>
      </View>

      <View style={styles.captureBar}>
        <Pressable
          accessibilityLabel="ライブラリから選ぶ"
          accessibilityRole="button"
          onPress={onPickImage}
          style={styles.captureAux}
        >
          <Ionicons color={colors.textOnDark} name="image-outline" size={22} />
        </Pressable>
        <Pressable
          accessibilityLabel="撮影"
          accessibilityRole="button"
          onPress={onShutter}
          style={styles.shutterOuter}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <Pressable
          accessibilityLabel="フラッシュ"
          accessibilityRole="button"
          onPress={onToggleFlash}
          style={styles.captureAux}
        >
          <Ionicons color={colors.textOnDark} name="flash-outline" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── 3. Person summary ───────────────────────────────────────────────────────

export type PersonSummary = Readonly<{
  avatarUri: string | null;
  company: string;
  department: string;
  headlines: readonly { date: string; text: string }[];
  keywords: readonly string[];
  name: string;
  nameRoman: string;
  summary: string;
}>;

const summaryActions = [
  { icon: "user", label: "プロフィール" },
  { icon: "file-text", label: "会社情報" },
  { icon: "users", label: "つながり" },
  { icon: "edit-3", label: "メモ" },
] as const;

export function PersonSummaryScreen({
  onBack,
  onEdit,
  onStartAnalysis,
  person,
}: {
  onBack?: () => void;
  onEdit?: () => void;
  onStartAnalysis?: () => void;
  person: PersonSummary;
}) {
  return (
    <Screen>
      <NavBar
        action="編集"
        onAction={onEdit}
        onBack={onBack}
        title="人物サマリー"
      />
      <Body>
        <View style={styles.personHeader}>
          <Avatar size={72} uri={person.avatarUri} />
          <View style={styles.personIdentity}>
            <Text style={styles.personName}>{person.name}</Text>
            <Text style={styles.personRoman}>{person.nameRoman}</Text>
            <Text style={styles.personMeta}>{person.company}</Text>
            <Text style={styles.personMeta}>{person.department}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {summaryActions.map((action) => (
            <View key={action.label} style={styles.actionTile}>
              <Feather color={colors.muted} name={action.icon} size={18} />
              <Text style={styles.actionLabel}>{action.label}</Text>
            </View>
          ))}
        </View>

        <Card>
          <View style={styles.briefHead}>
            <Text style={styles.briefTitle}>5秒Brief</Text>
            <View style={styles.aiTag}>
              <Feather color={colors.accent} name="zap" size={11} />
              <Text style={styles.aiTagText}>AI生成</Text>
            </View>
          </View>
          <Text style={styles.paragraph}>{person.summary}</Text>
        </Card>

        <Card>
          <SectionTitle>キーワード</SectionTitle>
          <ChipRow>
            {person.keywords.map((keyword) => (
              <Chip key={keyword} label={keyword} />
            ))}
          </ChipRow>
        </Card>

        <Card>
          <SectionTitle>最新情報</SectionTitle>
          <View style={styles.headlineList}>
            {person.headlines.map((item) => (
              <View key={item.text} style={styles.headlineRow}>
                <Text style={styles.headlineDot}>・</Text>
                <Text style={styles.headlineDate}>{item.date}</Text>
                <Text style={styles.headlineText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </Card>

        <PrimaryButton label="分析を始める" onPress={onStartAnalysis} />
      </Body>
    </Screen>
  );
}

function Avatar({ size, uri }: { size: number; uri: string | null }) {
  const style = { borderRadius: size / 2, height: size, width: size };

  if (uri) {
    return <Image source={{ uri }} style={[styles.avatar, style]} />;
  }

  return (
    <View style={[styles.avatar, styles.avatarEmpty, style]}>
      <Feather
        color={colors.muted}
        name="user"
        size={Math.round(size * 0.45)}
      />
    </View>
  );
}

// ─── 4. Analysis preparation ─────────────────────────────────────────────────

export type OwnContext = Readonly<{
  company: string;
  interests: readonly string[];
  offers: readonly string[];
  role: string;
  skills: readonly string[];
  wants: readonly string[];
}>;

export function AnalysisPrepScreen({
  context,
  onBack,
  onEdit,
  onEditPurpose,
  onEditSituation,
  onRun,
  purpose,
  situation,
}: {
  context: OwnContext;
  onBack?: () => void;
  onEdit?: () => void;
  onEditPurpose?: () => void;
  onEditSituation?: () => void;
  onRun?: () => void;
  purpose: string;
  situation: string;
}) {
  return (
    <Screen>
      <NavBar onBack={onBack} title="分析の準備" />
      <Body>
        <Card>
          <View style={styles.cardHead}>
            <SectionTitle>あなたについて</SectionTitle>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onEdit}>
              <Text style={styles.cardHeadAction}>編集</Text>
            </Pressable>
          </View>

          <View style={styles.stack}>
            <FieldLabel>所属</FieldLabel>
            <Text style={styles.value}>{context.company}</Text>
          </View>
          <View style={styles.stack}>
            <FieldLabel>役職</FieldLabel>
            <Text style={styles.value}>{context.role}</Text>
          </View>

          <ChipGroup label="スキル" values={context.skills} />
          <ChipGroup label="興味・関心" values={context.interests} />
          <ChipGroup label="あなたの提供できる価値" values={context.offers} />
          <ChipGroup label="あなたが得たいもの" values={context.wants} />
        </Card>

        <Card style={styles.tightCard}>
          <DisclosureRow
            caption={situation}
            label="状況 (Situation)"
            onPress={onEditSituation}
          />
          <View style={styles.divider} />
          <DisclosureRow
            caption={purpose}
            label="目的"
            onPress={onEditPurpose}
          />
        </Card>

        <PrimaryButton label="分析する" onPress={onRun} />
      </Body>
    </Screen>
  );
}

function ChipGroup({
  label,
  values,
}: {
  label: string;
  values: readonly string[];
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.groupLabel}>{label}</Text>
      <ChipRow>
        {values.map((value) => (
          <Chip key={value} label={value} tone="accent" />
        ))}
      </ChipRow>
    </View>
  );
}

function DisclosureRow({
  caption,
  label,
  onPress,
}: {
  caption: string;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.disclosure}
    >
      <View style={styles.disclosureText}>
        <Text style={styles.disclosureLabel}>{label}</Text>
        <Text style={styles.disclosureCaption}>{caption}</Text>
      </View>
      <Feather color={colors.muted} name="chevron-right" size={18} />
    </Pressable>
  );
}

// ─── 5. Analysis result ──────────────────────────────────────────────────────

export const analysisTabs = ["GIVE / GET", "BRIDGE", "会話提案"] as const;
export type AnalysisTab = (typeof analysisTabs)[number];

export type AnalysisResult = Readonly<{
  bridgeItems: readonly string[];
  bridgeThemes: readonly string[];
  compatibility: number;
  compatibilityNote: string;
  compatibilityVerdict: string;
  getItems: readonly string[];
  giveItems: readonly string[];
  questions: readonly string[];
  speakingTip: string;
}>;

export function AnalysisResultScreen({
  onBack,
  onTabChange,
  result,
  tab,
}: {
  onBack?: () => void;
  onTabChange: (tab: AnalysisTab) => void;
  result: AnalysisResult;
  tab: AnalysisTab;
}) {
  return (
    <Screen>
      <NavBar onBack={onBack} title="分析結果" />
      <SegmentedTabs
        onChange={onTabChange}
        options={analysisTabs}
        value={tab}
      />
      <Body>
        {tab === "GIVE / GET" ? (
          <>
            <Card>
              <ExchangeHead
                caption="あなたが相手に提供できる価値"
                icon="arrow-up-circle"
                tint={colors.give}
                tintSoft={colors.giveSoft}
                title="GIVE（あなた→相手）"
              />
              {result.giveItems.map((item) => (
                <TickRow key={item} label={item} tint={colors.give} />
              ))}
            </Card>

            <Card>
              <ExchangeHead
                caption="あなたが相手から得られる価値"
                icon="arrow-down-circle"
                tint={colors.get}
                tintSoft={colors.getSoft}
                title="GET（相手→あなた）"
              />
              {result.getItems.map((item) => (
                <TickRow key={item} label={item} tint={colors.get} />
              ))}
            </Card>

            <Card>
              <SectionTitle>相性スコア</SectionTitle>
              <View style={styles.scoreRow}>
                <ScoreDonut value={result.compatibility} />
                <View style={styles.scoreText}>
                  <Text style={styles.scoreVerdict}>
                    {result.compatibilityVerdict}
                  </Text>
                  <Text style={styles.scoreNote}>
                    {result.compatibilityNote}
                  </Text>
                </View>
              </View>
            </Card>
          </>
        ) : null}

        {tab === "BRIDGE" ? (
          <>
            <Card>
              <ExchangeHead
                caption="お互いに価値がありうる接点"
                icon="git-merge"
                tint={colors.bridge}
                tintSoft={colors.bridgeSoft}
                title="BRIDGE（接点の架け橋）"
              />
              {result.bridgeItems.map((item) => (
                <View key={item} style={styles.bridgeItem}>
                  <View style={styles.bridgeGlyph}>
                    <Feather color={colors.give} name="link-2" size={13} />
                  </View>
                  <Text style={styles.bridgeText}>{item}</Text>
                </View>
              ))}
            </Card>

            <Card>
              <SectionTitle>接点のテーマ例</SectionTitle>
              <ChipRow>
                {result.bridgeThemes.map((theme) => (
                  <Chip key={theme} label={theme} />
                ))}
              </ChipRow>
            </Card>
          </>
        ) : null}

        {tab === "会話提案" ? (
          <>
            <Card>
              <View>
                <SectionTitle>今、話すならこれ！</SectionTitle>
                <Text style={styles.cardCaption}>おすすめの会話トピック</Text>
              </View>
              {result.questions.map((question, index) => (
                <View key={question} style={styles.questionRow}>
                  <View style={styles.questionIndex}>
                    <Text style={styles.questionIndexText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.questionText}>{question}</Text>
                </View>
              ))}
            </Card>

            <View style={styles.tipCard}>
              <Text style={styles.tipTitle}>話し方のコツ</Text>
              <Text style={styles.tipText}>{result.speakingTip}</Text>
            </View>
          </>
        ) : null}
      </Body>
    </Screen>
  );
}

function ExchangeHead({
  caption,
  icon,
  tint,
  tintSoft,
  title,
}: {
  caption: string;
  icon: "arrow-up-circle" | "arrow-down-circle" | "git-merge";
  tint: string;
  tintSoft: string;
  title: string;
}) {
  return (
    <View style={styles.exchangeHead}>
      <View style={[styles.exchangeIcon, { backgroundColor: tintSoft }]}>
        <Feather color={tint} name={icon} size={16} />
      </View>
      <View style={styles.exchangeHeadText}>
        <Text style={styles.exchangeTitle}>{title}</Text>
        <Text style={styles.cardCaption}>{caption}</Text>
      </View>
    </View>
  );
}

function TickRow({ label, tint }: { label: string; tint: string }) {
  return (
    <View style={styles.tickRow}>
      <Feather color={tint} name="check-square" size={17} />
      <Text style={styles.tickText}>{label}</Text>
    </View>
  );
}

// ─── 6. Conversation log ─────────────────────────────────────────────────────

export type NextActionItem = Readonly<{
  done: boolean;
  label: string;
}>;

export function ConversationLogScreen({
  actions,
  note,
  onBack,
  onChangeNote,
  onSave,
  onToggleAction,
  reminder,
}: {
  actions: readonly NextActionItem[];
  note: string;
  onBack?: () => void;
  onChangeNote?: (note: string) => void;
  onSave?: () => void;
  onToggleAction?: (index: number) => void;
  reminder: string;
}) {
  return (
    <Screen>
      <NavBar
        action="保存"
        onAction={onSave}
        onBack={onBack}
        title="会話を記録"
      />
      <Body>
        <View style={styles.stack}>
          <SectionTitle>会話メモ</SectionTitle>
          <NoteArea onChangeText={onChangeNote} value={note} />
        </View>

        <View style={styles.stack}>
          <SectionTitle>次にやること（Next Action）</SectionTitle>
          <Card style={styles.tightCard}>
            {actions.map((action, index) => (
              <CheckRow
                checked={action.done}
                key={action.label}
                label={action.label}
                onToggle={() => onToggleAction?.(index)}
                tone="box"
              />
            ))}
          </Card>
        </View>

        <View style={styles.stack}>
          <SectionTitle>リマインダー設定</SectionTitle>
          <View style={styles.reminderRow}>
            <View style={styles.reminderValue}>
              <Text style={styles.reminderText}>{reminder}</Text>
            </View>
            <View style={styles.reminderBell}>
              <Feather color={colors.muted} name="bell" size={18} />
            </View>
          </View>
        </View>

        <PrimaryButton label="保存する" onPress={onSave} />
      </Body>
    </Screen>
  );
}

// ─── 7. Home ─────────────────────────────────────────────────────────────────

export const homeFilters = [
  "すべて",
  "要フォロー",
  "商談中",
  "協業候補",
] as const;
export type HomeFilter = (typeof homeFilters)[number];

export type PersonListItem = Readonly<{
  avatarUri: string | null;
  badge: string | null;
  company: string;
  department: string;
  id: string;
  name: string;
  score: number;
  updatedAt: string;
}>;

export const homeTabs = [
  { icon: "home", label: "ホーム" },
  { icon: "camera", label: "名刺を撮影" },
  { icon: "bar-chart-2", label: "分析" },
  { icon: "user", label: "プロフィール" },
] as const;

export function HomeScreen({
  activeTab = "ホーム",
  filter,
  items,
  onChangeFilter,
  onChangeSearch,
  onOpenPerson,
  onSelectTab,
  search,
}: {
  activeTab?: string;
  filter: HomeFilter;
  items: readonly PersonListItem[];
  onChangeFilter: (filter: HomeFilter) => void;
  onChangeSearch?: (search: string) => void;
  onOpenPerson?: (id: string) => void;
  onSelectTab?: (label: string) => void;
  search: string;
}) {
  return (
    <Screen>
      <NavBar title="ホーム" />
      <View style={styles.homeControls}>
        <SearchField
          onChangeText={onChangeSearch}
          placeholder="人物を検索"
          value={search}
        />
        <FilterTabs
          onChange={onChangeFilter}
          options={homeFilters}
          value={filter}
        />
      </View>

      <ScrollView contentContainerStyle={styles.homeList}>
        {items.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => onOpenPerson?.(item.id)}
            style={styles.personRow}
          >
            <Avatar size={48} uri={item.avatarUri} />
            <View style={styles.personRowText}>
              <Text style={styles.personRowName}>{item.name}</Text>
              <Text style={styles.personRowMeta}>{item.company}</Text>
              <Text style={styles.personRowMeta}>{item.department}</Text>
              {item.badge ? <Badge label={item.badge} /> : null}
            </View>
            <View style={styles.personRowScore}>
              <ScoreDonut caption="相性スコア" size={46} value={item.score} />
              <Text style={styles.personRowTime}>{item.updatedAt}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.tabBar}>
        {homeTabs.map((item) => {
          const active = item.label === activeTab;

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item.label}
              onPress={() => onSelectTab?.(item.label)}
              style={styles.tabItem}
            >
              <Feather
                color={active ? colors.accent : colors.muted}
                name={item.icon}
                size={20}
              />
              <Text
                style={[styles.tabItemText, active && styles.tabItemTextActive]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionLabel: { ...typography.micro, color: colors.muted },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  actionTile: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    paddingVertical: 10,
  },
  aiTag: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  aiTagText: { ...typography.micro, color: colors.accentSoftText },
  avatar: { backgroundColor: colors.track },
  avatarEmpty: { alignItems: "center", justifyContent: "center" },
  body: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  bridgeGlyph: {
    alignItems: "center",
    backgroundColor: colors.giveSoft,
    borderRadius: radius.sm,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  bridgeItem: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  bridgeText: { ...typography.body, color: colors.text, flex: 1 },
  briefHead: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  briefTitle: { ...typography.heading, color: colors.text },
  capture: { backgroundColor: colors.cameraChrome, flex: 1 },
  captureAux: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  captureBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
  },
  captureClose: { left: 0, position: "absolute" },
  captureHeader: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  capturePlaceholder: { backgroundColor: "#6B4B32", flex: 1 },
  captureStage: { flex: 1, overflow: "hidden" },
  captureSubtitle: {
    ...typography.caption,
    color: colors.textOnDarkMuted,
    textAlign: "center",
  },
  captureTitle: {
    ...typography.heading,
    color: colors.textOnDark,
    textAlign: "center",
  },
  cardCaption: { ...typography.caption, color: colors.muted },
  cardHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardHeadAction: { ...typography.captionStrong, color: colors.accent },
  corner: {
    borderColor: colors.textOnDark,
    height: 26,
    position: "absolute",
    width: 26,
  },
  cornerBottomLeft: {
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    bottom: 0,
    left: 0,
  },
  cornerBottomRight: {
    borderBottomWidth: 3,
    borderRightWidth: 3,
    bottom: 0,
    right: 0,
  },
  cornerTopLeft: { borderLeftWidth: 3, borderTopWidth: 3, left: 0, top: 0 },
  cornerTopRight: { borderRightWidth: 3, borderTopWidth: 3, right: 0, top: 0 },
  disclosure: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  disclosureCaption: { ...typography.body, color: colors.text },
  disclosureLabel: { ...typography.captionStrong, color: colors.text },
  disclosureText: { flex: 1, gap: 2 },
  divider: { backgroundColor: colors.border, height: 1 },
  donut: { alignItems: "center" },
  donutCaption: { ...typography.micro, color: colors.muted, marginTop: 2 },
  donutCentre: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  donutRotate: { transform: [{ rotate: "-90deg" }] },
  donutValue: { color: colors.accent, fontWeight: "800" },
  exchangeHead: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
  },
  exchangeHeadText: { flex: 1, gap: 2 },
  exchangeIcon: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  exchangeTitle: { ...typography.bodyStrong, color: colors.text },
  groupLabel: { ...typography.captionStrong, color: colors.text },
  // Overlays the live preview rather than sitting after it in the flow.
  guide: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  // Business-card proportions, so the brackets frame the card rather than the
  // whole viewfinder.
  guideFrame: { aspectRatio: 1.6, width: "82%" },
  headlineDate: { ...typography.caption, color: colors.muted },
  headlineDot: { ...typography.caption, color: colors.muted },
  headlineList: { gap: spacing.xs },
  headlineRow: { flexDirection: "row", gap: spacing.xs },
  headlineText: { ...typography.caption, color: colors.text, flex: 1 },
  homeControls: {
    backgroundColor: colors.surface,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  homeList: { gap: spacing.sm, padding: spacing.md },
  logoGlyph: { color: colors.onAccent, fontSize: 44, fontWeight: "700" },
  logoMark: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 92,
    justifyContent: "center",
    width: 92,
  },
  paragraph: { ...typography.body, color: colors.text },
  personHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  personIdentity: { flex: 1, gap: 1 },
  personMeta: { ...typography.caption, color: colors.muted },
  personName: { ...typography.title, color: colors.text },
  personRoman: { ...typography.caption, color: colors.muted },
  personRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    ...elevation.card,
  },
  personRowMeta: { ...typography.caption, color: colors.muted },
  personRowName: { ...typography.bodyStrong, color: colors.text },
  personRowScore: { alignItems: "center", gap: 2 },
  personRowText: { flex: 1, gap: 1 },
  personRowTime: {
    ...typography.micro,
    color: colors.muted,
    fontWeight: "400",
  },
  questionIndex: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  questionIndexText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: "700",
  },
  questionRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  questionText: { ...typography.body, color: colors.text, flex: 1 },
  reminderBell: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  reminderRow: { flexDirection: "row", gap: spacing.sm },
  reminderText: { ...typography.body, color: colors.text },
  reminderValue: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  scoreNote: { ...typography.caption, color: colors.muted },
  scoreRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  scoreText: { flex: 1, gap: spacing.xs },
  scoreVerdict: { ...typography.heading, color: colors.accent },
  screen: { backgroundColor: colors.background, flex: 1 },
  shutterInner: {
    backgroundColor: colors.textOnDark,
    borderRadius: radius.pill,
    height: 58,
    width: 58,
  },
  shutterOuter: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: radius.pill,
    borderWidth: 3,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  stack: { gap: spacing.xs },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    ...elevation.bar,
  },
  tabItem: { alignItems: "center", flex: 1, gap: 3 },
  tabItemText: { ...typography.micro, color: colors.muted, fontWeight: "500" },
  tabItemTextActive: { color: colors.accent, fontWeight: "700" },
  tickRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  tickText: { ...typography.body, color: colors.text, flex: 1 },
  tightCard: { gap: 0 },
  tipCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    gap: spacing.xs,
    padding: spacing.md,
  },
  tipText: { ...typography.caption, color: colors.text },
  tipTitle: { ...typography.captionStrong, color: colors.accentSoftText },
  value: { ...typography.body, color: colors.text },
  welcome: { flex: 1, justifyContent: "space-between", padding: spacing.lg },
  welcomeActions: { gap: spacing.md, paddingBottom: spacing.xl },
  welcomeCentre: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
  },
  welcomeLink: {
    ...typography.body,
    color: colors.textOnDarkMuted,
    textAlign: "center",
  },
  welcomeTagline: { ...typography.caption, color: colors.textOnDarkMuted },
  welcomeTitle: { ...typography.display, color: colors.textOnDark },
});
