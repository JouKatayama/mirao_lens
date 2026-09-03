import type { FlashBriefPublic, MutualValuePublic } from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Icon } from "./icons";
import {
  Avatar,
  Card,
  Chips,
  ErrorNotice,
  Field,
  PrimaryButton,
  ScreenFrame,
  SecondaryButton,
  TabBar,
  TextButton,
} from "./ui";

type Person = {
  name: string | null;
  company: string | null;
  title: string | null;
};
const analysisTabs = [
  { value: "give-get", label: "GIVE / GET" },
  { value: "bridge", label: "BRIDGE" },
  { value: "conversation", label: "会話提案" },
] as const;
type AnalysisTab = (typeof analysisTabs)[number]["value"];

export function FlashBriefScreen({
  brief,
  card,
  deepEnriching,
  error,
  onDone,
  onRefresh,
  onViewCard,
  onViewEvidence,
  onViewMutualValue,
  onViewInteraction,
}: {
  brief: FlashBriefPublic;
  card: Person;
  deepEnriching: boolean;
  error: string | null;
  onDone: () => void;
  onRefresh: () => Promise<void>;
  onViewCard: () => void;
  onViewEvidence: () => void;
  onViewMutualValue: () => void;
  onViewInteraction?: () => void;
}) {
  const identityLabels = {
    verified: "本人確認済み",
    high_confidence: "本人の可能性が高い",
    medium_confidence: "本人確認が必要",
    unresolved: "本人未確認",
  };
  const shortcuts = [
    { label: "プロフィール", icon: "person", action: onViewCard },
    { label: "会社情報", icon: "company", action: onViewEvidence },
    { label: "つながり", icon: "people", action: onViewMutualValue },
    { label: "メモ", icon: "note", action: onViewInteraction },
  ] as const;
  return (
    <ScreenFrame
      title="人物サマリー"
      onBack={onDone}
      action={<TextButton label="編集" onPress={onViewCard} />}
      footer={
        <PrimaryButton label="分析を始める" onPress={onViewMutualValue} />
      }
    >
      <View style={s.person}>
        <Avatar name={card.name} large />
        <View style={s.personText}>
          <Text style={s.name}>{card.name || "名前未登録"}</Text>
          <Text style={s.body}>{card.company}</Text>
          <Text style={s.body}>{card.title}</Text>
        </View>
      </View>
      <View style={s.shortcuts}>
        {shortcuts.map((shortcut) => (
          <Pressable
            key={shortcut.label}
            accessibilityRole="button"
            accessibilityLabel={shortcut.label}
            accessibilityState={{ disabled: !shortcut.action }}
            disabled={!shortcut.action}
            onPress={shortcut.action}
            style={({ pressed }) => [
              s.shortcut,
              pressed && s.pressed,
              !shortcut.action && s.disabled,
            ]}
          >
            <View style={s.shortcutIcon}>
              <Icon name={shortcut.icon} />
            </View>
            <Text style={s.shortcutText}>{shortcut.label}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <View style={s.row}>
          <Text style={s.heading}>5秒Brief</Text>
          <Chips items={["AI生成"]} />
        </View>
        <Text style={s.body}>{brief.who}</Text>
      </Card>
      <View style={s.section}>
        <Text style={s.heading}>キーワード</Text>
        <Chips
          items={[card.company, card.title].filter((value): value is string =>
            Boolean(value),
          )}
        />
      </View>
      <Card>
        <Text style={s.heading}>あなたとの接点</Text>
        <Text style={s.body}>{brief.why_you}</Text>
      </Card>
      <View style={s.section}>
        <Text style={s.meta}>
          {identityLabels[brief.identity_status]} · AIによる推測を含みます
        </Text>
        {deepEnriching ? (
          <Text style={s.meta}>詳しい分析を準備しています…</Text>
        ) : null}
      </View>
      <ErrorNotice message={error} />
      {error ? (
        <SecondaryButton label="再読み込み" onPress={() => void onRefresh()} />
      ) : null}
    </ScreenFrame>
  );
}

function ValueSection({
  title,
  subtitle,
  items,
  tone,
}: {
  title: string;
  subtitle: string;
  items: MutualValuePublic["give"];
  tone: string;
}) {
  return (
    <View style={s.valueSection}>
      <View style={s.row}>
        <View style={[s.valueIcon, { backgroundColor: tone }]}>
          <Icon name="gift" color="#FFFFFF" size={22} />
        </View>
        <View style={s.flex}>
          <Text style={s.heading}>{title}</Text>
          <Text style={s.caption}>{subtitle}</Text>
        </View>
      </View>
      {items.map((item, i) => (
        <View style={s.valueRow} key={i}>
          <Icon name="checked" size={18} color={tone} />
          <View style={[s.flex, s.claimRow]}>
            <Text style={[s.body, s.flex]}>{item.text}</Text>
            <Text
              style={[
                s.claim,
                {
                  color: item.claim_type === "fact" ? "#148366" : colors.muted,
                },
              ]}
            >
              {item.claim_type === "fact" ? "事実" : "仮説"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function MutualValueScreen({
  card,
  error,
  mutualValue,
  onDone,
  onRefresh,
  onViewBrief,
  onViewInteraction,
  potential,
  themes = [],
  initialTab = "give-get",
}: {
  card: Person;
  error: string | null;
  mutualValue: MutualValuePublic | null;
  onDone: () => void;
  onRefresh: () => Promise<void>;
  onViewBrief: () => void;
  onViewInteraction: () => void;
  potential?: string;
  themes?: string[];
  initialTab?: AnalysisTab;
}) {
  const [tab, setTab] = useState<AnalysisTab>(initialTab);
  if (!mutualValue)
    return (
      <ScreenFrame title="分析結果" onBack={onViewBrief}>
        <Card>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={s.heading}>
            {card.name || "相手"}さんとの接点を分析中…
          </Text>
          <Text style={s.meta}>分析が完了すると結果が表示されます。</Text>
        </Card>
        <ErrorNotice message={error} />
        <SecondaryButton
          label="状態を再確認"
          onPress={() => void onRefresh()}
        />
        <TextButton label="ホームへ戻る" onPress={onDone} />
      </ScreenFrame>
    );
  return (
    <ScreenFrame
      title="分析結果"
      onBack={onViewBrief}
      tabs={<TabBar items={analysisTabs} selected={tab} onSelect={setTab} />}
    >
      {tab === "give-get" ? (
        <>
          <Card>
            <ValueSection
              title="GIVE（あなた→相手）"
              subtitle="あなたが相手に提供できる価値"
              items={mutualValue.give}
              tone={colors.give}
            />
            <ValueSection
              title="GET（相手→あなた）"
              subtitle="あなたが相手から得られる価値"
              items={mutualValue.get}
              tone={colors.get}
            />
          </Card>
          {potential ? (
            <Card>
              <Text style={s.heading}>関係性の可能性</Text>
              <View style={s.row}>
                <View style={s.potentialIcon}>
                  <Icon name="people" color={colors.accentStrong} size={30} />
                </View>
                <Text style={[s.body, s.flex]}>{potential}</Text>
              </View>
            </Card>
          ) : null}
        </>
      ) : null}
      {tab === "bridge" ? (
        <>
          <Card>
            <View style={s.row}>
              <Icon name="bridge" color={colors.get} size={29} />
              <View style={s.flex}>
                <Text style={s.heading}>BRIDGE（接点の架け橋）</Text>
                <Text style={s.caption}>お互いに価値がありそうな接点</Text>
              </View>
            </View>
            {mutualValue.bridge
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <View style={s.bridgeItem} key={index}>
                  <Icon name="bulb" color={colors.give} size={22} />
                  <Text style={[s.body, s.flex]}>{paragraph}</Text>
                </View>
              ))}
            <Text style={s.meta}>AIによる提案・仮説</Text>
          </Card>
          {themes.length ? (
            <View style={s.section}>
              <Text style={s.heading}>あなたの関心テーマ</Text>
              <Chips items={themes} />
            </View>
          ) : null}
        </>
      ) : null}
      {tab === "conversation" ? (
        <>
          <Card>
            <Text style={s.heading}>今、話すならこれ！</Text>
            <Text style={s.caption}>おすすめの会話トピック</Text>
            {mutualValue.ask.map((item, index) => (
              <View style={s.questionRow} key={index}>
                <View style={s.number}>
                  <Text style={s.numberText}>{index + 1}</Text>
                </View>
                <View style={s.flex}>
                  <Text style={s.question}>{item.question}</Text>
                  {item.validates_hypothesis ? (
                    <Text style={s.caption}>
                      確認したいこと：{item.validates_hypothesis}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
          <View style={s.tip}>
            <Text style={s.heading}>話し方のコツ</Text>
            <Text style={s.small}>
              まずは相手の課題や取り組みについて質問し、共感を示しながら自分の経験を自然に伝えましょう。
            </Text>
          </View>
          <PrimaryButton label="会話を記録する" onPress={onViewInteraction} />
        </>
      ) : null}
      <ErrorNotice message={error} />
    </ScreenFrame>
  );
}

export function InteractionScreen({
  card,
  error,
  mutualValue,
  onAcceptNextAction,
  onDismissNextAction,
  onDone,
  onSaveNote,
  onViewMutualValue,
}: {
  card: Person;
  error: string | null;
  mutualValue: MutualValuePublic;
  onAcceptNextAction: (
    actionText: string,
    timingText: string | null,
  ) => Promise<void>;
  onDismissNextAction: (actionText: string) => Promise<void>;
  onDone: () => void;
  onSaveNote: (noteText: string) => Promise<void>;
  onViewMutualValue: () => void;
}) {
  const [note, setNote] = useState("");
  const [action, setAction] = useState(mutualValue.next_action.action);
  const [timing, setTiming] = useState(mutualValue.next_action.timing || "");
  const [accepted, setAccepted] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [savedAction, setSavedAction] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const actionKey = JSON.stringify([accepted, action.trim(), timing.trim()]);
  async function save() {
    if (saving) return;
    if (accepted && !action.trim()) {
      setLocalError("次にやることを入力してください。");
      return;
    }
    setSaving(true);
    setLocalError(null);
    try {
      if (note.trim() && note.trim() !== savedNote) {
        await onSaveNote(note.trim());
        setSavedNote(note.trim());
      }
      if (savedAction !== actionKey) {
        if (accepted)
          await onAcceptNextAction(action.trim(), timing.trim() || null);
        else await onDismissNextAction(mutualValue.next_action.action);
        setSavedAction(actionKey);
      }
      onDone();
    } catch {
      setLocalError(
        "保存できませんでした。入力内容は保持されています。再試行してください。",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <ScreenFrame
      title="会話を記録"
      onBack={onViewMutualValue}
      action={
        <TextButton
          label="保存"
          disabled={saving}
          onPress={() => void save()}
        />
      }
      footer={
        <PrimaryButton
          label="保存する"
          loading={saving}
          onPress={() => void save()}
        />
      }
    >
      <View style={s.section}>
        <Text style={s.heading}>会話メモ</Text>
        <Field
          label={`${card.name || "相手"}さんとの会話`}
          multiline
          maxLength={4000}
          editable={!saving}
          value={note}
          onChangeText={setNote}
          placeholder="会話で気づいたことや、相手の関心を記録…"
          style={s.noteInput}
        />
      </View>
      <View style={s.section}>
        <Text style={s.heading}>次にやること（Next Action）</Text>
        <Card>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted, disabled: saving }}
            aria-checked={accepted}
            aria-disabled={saving}
            disabled={saving}
            onPress={() => setAccepted(!accepted)}
            style={s.checkboxRow}
          >
            <View style={[s.checkbox, accepted && s.checkboxActive]}>
              {accepted ? (
                <Icon name="check" size={15} color="#FFFFFF" />
              ) : null}
            </View>
            <Text style={[s.body, s.flex]}>{action}</Text>
          </Pressable>
          <Text style={s.caption}>{mutualValue.next_action.reason}</Text>
          <TextButton
            label={editing ? "編集を閉じる" : "内容を編集"}
            onPress={() => setEditing(!editing)}
          />
          {editing ? (
            <Field
              label="次にやること"
              maxLength={2000}
              value={action}
              onChangeText={setAction}
              multiline
              editable={!saving}
            />
          ) : null}
        </Card>
      </View>
      <View style={s.section}>
        <Text style={s.heading}>実行のタイミング</Text>
        <Field
          label="予定・目安"
          value={timing}
          onChangeText={setTiming}
          placeholder="例：今日中・3日以内"
          maxLength={200}
          editable={!saving}
        />
      </View>
      <ErrorNotice message={localError || error} />
    </ScreenFrame>
  );
}

const s = StyleSheet.create({
  claimRow: { flexDirection: "row", alignItems: "baseline", gap: 7 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  section: { gap: 10 },
  heading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
  },
  body: { color: colors.text, fontSize: 14, lineHeight: 24 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 4 },
  small: { color: "#483773", fontSize: 13, lineHeight: 22 },
  person: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    paddingVertical: 8,
  },
  personText: { flex: 1, gap: 4 },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 5,
  },
  shortcuts: { flexDirection: "row", gap: 8 },
  shortcut: { flex: 1, alignItems: "center", gap: 7, minHeight: 68 },
  shortcutIcon: {
    width: "100%",
    height: 48,
    borderRadius: 25,
    backgroundColor: "#F8F6FB",
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutText: { color: colors.muted, fontSize: 11 },
  valueSection: { gap: 12, paddingVertical: 6 },
  valueIcon: {
    width: 28,
    height: 31,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  valueRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingTop: 3,
  },
  claim: { fontSize: 10, lineHeight: 15 },
  potentialIcon: {
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bridgeItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    backgroundColor: "#FDFCFF",
    borderRadius: 9,
    padding: 14,
    marginTop: 12,
  },
  topic: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  topicText: { color: "#4D337D", fontSize: 13, lineHeight: 22 },
  questionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#FCFAFF",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  number: {
    backgroundColor: colors.accent,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  question: {
    color: "#41306F",
    fontSize: 14,
    lineHeight: 25,
    fontWeight: "500",
  },
  tip: { gap: 7, padding: 16, borderRadius: 10, backgroundColor: "#F6F0FF" },
  noteInput: {
    minHeight: 176,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    lineHeight: 25,
    color: colors.text,
    backgroundColor: "#FFFFFF",
    textAlignVertical: "top",
  },
  checkboxRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    minHeight: 44,
  },
  checkbox: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.accentStrong,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});
