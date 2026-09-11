import type {
  FlashBriefPublic,
  MutualValuePublic,
  NextActionResponse,
} from "@miraio/domain";
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
  onFlagIdentity,
  onMarkHypothesisUnhelpful,
  onRateUsefulness,
  onRefresh,
  onViewCard,
  onViewEncounters,
  onViewEvidence,
  onViewMutualValue,
  onViewInteraction,
  previousEncounters = 0,
}: {
  brief: FlashBriefPublic;
  card: Person;
  deepEnriching: boolean;
  error: string | null;
  onDone: () => void;
  onFlagIdentity?: () => void;
  onMarkHypothesisUnhelpful?: () => void;
  onRateUsefulness?: (rating: number) => void;
  onRefresh: () => Promise<void>;
  onViewCard: () => void;
  onViewEncounters?: () => void;
  onViewEvidence: () => void;
  onViewMutualValue: () => void;
  onViewInteraction?: () => void;
  previousEncounters?: number;
}) {
  // Trust and usefulness feedback is reported once per visit. The screen keeps
  // the acknowledgement locally: there is no server record of a report yet, so
  // hiding the control is the only confirmation the user gets.
  const [identityFlagged, setIdentityFlagged] = useState(false);
  const [hypothesisFlagged, setHypothesisFlagged] = useState(false);
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const identityLabels = {
    verified: "本人確認済み",
    high_confidence: "本人の可能性が高い",
    medium_confidence: "本人確認が必要",
    unresolved: "本人未確認",
  };
  const shortcuts: {
    label: string;
    icon: "person" | "company" | "note" | "people";
    action?: () => void;
  }[] = [
    { label: "名刺情報", icon: "person", action: onViewCard },
    { label: "根拠", icon: "company", action: onViewEvidence },
    { label: "メモ", icon: "note", action: onViewInteraction },
    ...(previousEncounters > 0
      ? [
          {
            label: "これまでの接点",
            icon: "people" as const,
            action: onViewEncounters,
          },
        ]
      : []),
  ];
  return (
    <ScreenFrame
      title="Flash Brief"
      onBack={onDone}
      action={<TextButton label="編集" onPress={onViewCard} />}
      footer={
        <PrimaryButton
          label="Win-Winを詳しく見る"
          onPress={onViewMutualValue}
        />
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
      <View style={s.briefHeader}>
        <Text style={s.eyebrow}>5-SECOND BRIEF</Text>
        <Text style={s.meta}>会話の前に、ここだけ確認</Text>
      </View>
      <Card>
        <View style={s.briefLabelRow}>
          <Text style={s.briefLabel}>WHO</Text>
          <View style={s.badgeRow}>
            {previousEncounters > 0 ? (
              <View style={s.encounterBadge}>
                <Text style={s.encounterBadgeText}>
                  {`この人とは${previousEncounters + 1}回目`}
                </Text>
              </View>
            ) : null}
            <View style={s.neutralBadge}>
              <Text style={s.neutralBadgeText}>
                {identityLabels[brief.identity_status]}
              </Text>
            </View>
          </View>
        </View>
        <Text style={s.briefBody}>{brief.who}</Text>
        {onFlagIdentity ? (
          identityFlagged ? (
            <Text style={s.caption}>
              別人の可能性として報告しました。ありがとうございます。
            </Text>
          ) : (
            <TextButton
              label="この人物ではないかもしれない"
              onPress={() => {
                setIdentityFlagged(true);
                onFlagIdentity();
              }}
            />
          )
        ) : null}
      </Card>
      <View style={[s.briefPanel, s.whyPanel]}>
        <View style={s.briefLabelRow}>
          <Text style={s.briefLabel}>WHY YOU</Text>
          <View
            style={
              brief.why_you_claim_type === "fact"
                ? s.factBadge
                : s.hypothesisBadge
            }
          >
            <Text
              style={
                brief.why_you_claim_type === "fact"
                  ? s.factBadgeText
                  : s.hypothesisBadgeText
              }
            >
              {brief.why_you_claim_type === "fact" ? "事実" : "仮説"}
            </Text>
          </View>
        </View>
        <Text style={s.briefBody}>{brief.why_you}</Text>
        {brief.connection_keywords.length > 0 ? (
          <View style={s.keywords}>
            <Text style={s.meta}>接点キーワード</Text>
            <Chips items={brief.connection_keywords} />
          </View>
        ) : null}
        {onMarkHypothesisUnhelpful ? (
          hypothesisFlagged ? (
            <Text style={s.caption}>役に立たない内容として記録しました。</Text>
          ) : (
            <TextButton
              label={
                brief.why_you_claim_type === "fact"
                  ? "この内容は役に立たない"
                  : "この仮説は役に立たない"
              }
              onPress={() => {
                setHypothesisFlagged(true);
                onMarkHypothesisUnhelpful();
              }}
            />
          )
        ) : null}
      </View>
      <View style={s.sayPanel}>
        <View style={s.briefLabelRow}>
          <Text style={[s.briefLabel, s.sayLabel]}>SAY THIS</Text>
          <View style={s.askBadge}>
            <Text style={s.askBadgeText}>質問</Text>
          </View>
        </View>
        {brief.say_this.map((question, index) => (
          <View key={`${question}-${index}`} style={s.sayRow}>
            <Icon name="bulb" color="#D9BCFF" size={22} />
            <Text style={[s.sayQuestion, s.flex]}>{question}</Text>
          </View>
        ))}
      </View>
      <View style={[s.briefPanel, s.potentialPanel]}>
        <View style={s.briefLabelRow}>
          <Text style={s.briefLabel}>POTENTIAL</Text>
          <View style={s.hypothesisBadge}>
            <Text style={s.hypothesisBadgeText}>可能性・仮説</Text>
          </View>
        </View>
        {brief.potential_score !== null ? (
          <View
            accessibilityRole="image"
            accessibilityLabel={`関係性の可能性 5段階中${brief.potential_score}`}
            style={s.scoreRow}
          >
            {[1, 2, 3, 4, 5].map((step) => (
              <Icon
                key={step}
                name="star"
                color={
                  brief.potential_score !== null &&
                  step <= brief.potential_score
                    ? colors.accentStrong
                    : colors.border
                }
                filled={
                  brief.potential_score !== null &&
                  step <= brief.potential_score
                }
                size={20}
              />
            ))}
            <Text style={s.scoreText}>{`${brief.potential_score} / 5`}</Text>
          </View>
        ) : null}
        <Text style={s.briefBody}>{brief.potential}</Text>
        {deepEnriching ? (
          <View style={s.enrichingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={s.meta}>詳しい分析を準備しています…</Text>
          </View>
        ) : null}
      </View>
      <Text style={s.disclaimer}>
        AIによる仮説は、相手への質問を通じて確かめてください。
      </Text>
      {onRateUsefulness ? (
        <Card>
          <Text style={s.heading}>このBriefは役に立ちましたか？</Text>
          {usefulness === null ? (
            <>
              <View style={s.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`5段階中${value}`}
                    onPress={() => {
                      setUsefulness(value);
                      onRateUsefulness(value);
                    }}
                    style={({ pressed }) => [
                      s.ratingButton,
                      pressed && s.pressed,
                    ]}
                  >
                    <Text style={s.ratingButtonText}>{value}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.ratingLegend}>
                <Text style={s.meta}>1 = 役に立たない</Text>
                <Text style={s.meta}>5 = とても役に立った</Text>
              </View>
            </>
          ) : (
            <Text style={s.caption}>
              {`${usefulness} / 5 として記録しました。ありがとうございます。`}
            </Text>
          )}
        </Card>
      ) : null}
      <View style={s.shortcuts}>
        {shortcuts.map((shortcut) =>
          shortcut.action ? (
            <Pressable
              key={shortcut.label}
              accessibilityRole="button"
              accessibilityLabel={shortcut.label}
              onPress={shortcut.action}
              style={({ pressed }) => [s.shortcut, pressed && s.pressed]}
            >
              <Icon
                name={shortcut.icon}
                color={colors.accentStrong}
                size={20}
              />
              <Text style={s.shortcutText}>{shortcut.label}</Text>
            </Pressable>
          ) : null,
        )}
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
  onSayThisUsed,
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
  onSayThisUsed?: (used: boolean) => void;
  onViewBrief: () => void;
  onViewInteraction: () => void;
  potential?: string;
  themes?: string[];
  initialTab?: AnalysisTab;
}) {
  const [tab, setTab] = useState<AnalysisTab>(initialTab);
  // Conversation Adoption Rate is the pilot North Star, and it can only be
  // measured by asking whether the suggested question was actually used.
  const [sayThisUsed, setSayThisUsed] = useState<boolean | null>(null);
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
          {onSayThisUsed ? (
            <Card>
              <Text style={s.heading}>この質問を実際に使いましたか？</Text>
              {sayThisUsed === null ? (
                <View style={s.adoptionRow}>
                  <View style={s.flex}>
                    <SecondaryButton
                      label="使った"
                      onPress={() => {
                        setSayThisUsed(true);
                        onSayThisUsed(true);
                      }}
                    />
                  </View>
                  <View style={s.flex}>
                    <SecondaryButton
                      label="使わなかった"
                      onPress={() => {
                        setSayThisUsed(false);
                        onSayThisUsed(false);
                      }}
                    />
                  </View>
                </View>
              ) : (
                <Text style={s.caption}>
                  {sayThisUsed
                    ? "「使った」として記録しました。"
                    : "「使わなかった」として記録しました。"}
                </Text>
              )}
            </Card>
          ) : null}
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

const nextActionStatusLabels: Record<NextActionResponse["status"], string> = {
  accepted: "実行予定",
  completed: "完了",
  dismissed: "見送り",
  suggested: "提案中",
};

export function InteractionScreen({
  card,
  error,
  mutualValue,
  onAcceptNextAction,
  onCompleteNextAction,
  onDismissNextAction,
  onDone,
  onSaveNote,
  onViewMutualValue,
  recordedActions = [],
}: {
  card: Person;
  error: string | null;
  mutualValue: MutualValuePublic;
  onAcceptNextAction: (
    actionText: string,
    timingText: string | null,
  ) => Promise<void>;
  onCompleteNextAction?: (actionId: string) => Promise<void>;
  onDismissNextAction: (actionText: string) => Promise<void>;
  onDone: () => void;
  onSaveNote: (noteText: string) => Promise<void>;
  onViewMutualValue: () => void;
  recordedActions?: NextActionResponse[];
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
  const [completingId, setCompletingId] = useState<string | null>(null);
  const settledActions = recordedActions.filter(
    (item) => item.status === "completed" || item.status === "dismissed",
  );
  const openActions = recordedActions.filter(
    (item) => item.status === "accepted" || item.status === "suggested",
  );

  async function complete(actionId: string) {
    if (!onCompleteNextAction || completingId) return;
    setCompletingId(actionId);
    setLocalError(null);
    try {
      await onCompleteNextAction(actionId);
    } catch {
      setLocalError("完了を記録できませんでした。再試行してください。");
    } finally {
      setCompletingId(null);
    }
  }

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
      {recordedActions.length > 0 ? (
        <View style={s.section}>
          <Text style={s.heading}>記録済みのNext Action</Text>
          <Text style={s.caption}>
            実行できたものを完了にすると、成果として残ります。
          </Text>
          {[...openActions, ...settledActions].map((item) => (
            <Card key={item.id}>
              <View style={s.briefLabelRow}>
                <Text style={[s.body, s.flex]}>{item.action_text}</Text>
                <View
                  style={
                    item.status === "completed"
                      ? s.completedBadge
                      : s.neutralBadge
                  }
                >
                  <Text
                    style={
                      item.status === "completed"
                        ? s.completedBadgeText
                        : s.neutralBadgeText
                    }
                  >
                    {nextActionStatusLabels[item.status]}
                  </Text>
                </View>
              </View>
              {item.timing_text ? (
                <Text style={s.caption}>目安：{item.timing_text}</Text>
              ) : null}
              {onCompleteNextAction &&
              (item.status === "accepted" || item.status === "suggested") ? (
                <SecondaryButton
                  disabled={completingId !== null}
                  label={
                    completingId === item.id ? "記録中…" : "実行した（完了）"
                  }
                  onPress={() => void complete(item.id)}
                />
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}
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
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24,
  },
  body: { color: colors.text, fontSize: 15, lineHeight: 24 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 4 },
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
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 5,
  },
  briefHeader: { gap: 2, marginTop: 2 },
  eyebrow: {
    color: colors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  briefLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  briefLabel: {
    color: colors.accentStrong,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  briefBody: { color: colors.text, fontSize: 16, lineHeight: 26 },
  briefPanel: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  whyPanel: {
    backgroundColor: colors.accentFaint,
    borderColor: colors.accentSoft,
  },
  potentialPanel: {
    backgroundColor: "#F6F9FF",
    borderColor: "#DCE6FA",
  },
  sayPanel: {
    backgroundColor: colors.dark,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  sayLabel: { color: "#D9BCFF" },
  sayRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sayQuestion: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 29,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  completedBadge: {
    backgroundColor: colors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  completedBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "800",
  },
  encounterBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  encounterBadgeText: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: "800",
  },
  neutralBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  neutralBadgeText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  factBadge: {
    backgroundColor: colors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  factBadgeText: { color: colors.success, fontSize: 11, fontWeight: "800" },
  keywords: { gap: 6 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  scoreText: {
    color: colors.accentStrong,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
  hypothesisBadge: {
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  hypothesisBadgeText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "800",
  },
  askBadge: {
    backgroundColor: "#342348",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  askBadgeText: { color: "#E5D3FF", fontSize: 11, fontWeight: "800" },
  enrichingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shortcut: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shortcutText: { color: colors.accentStrong, fontSize: 13, fontWeight: "700" },
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
  adoptionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  ratingRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  ratingButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    backgroundColor: colors.accentFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingButtonText: {
    color: colors.accentStrong,
    fontSize: 16,
    fontWeight: "800",
  },
  ratingLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 6,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});
