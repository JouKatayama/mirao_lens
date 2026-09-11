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
  isFavorite = false,
  onChangeMeetingGoal,
  onDone,
  onFlagIdentity,
  onMarkHypothesisUnhelpful,
  onRateUsefulness,
  onRefresh,
  onToggleFavorite,
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
  isFavorite?: boolean;
  onChangeMeetingGoal?: () => void;
  onDone: () => void;
  onFlagIdentity?: () => void;
  onMarkHypothesisUnhelpful?: () => void;
  onRateUsefulness?: (rating: number) => void;
  onRefresh: () => Promise<void>;
  onToggleFavorite?: (next: boolean) => Promise<void>;
  onViewCard: () => void;
  onViewEncounters?: () => void;
  onViewEvidence: () => void;
  onViewMutualValue: () => void;
  onViewInteraction: () => void;
  previousEncounters?: number;
}) {
  // Trust and usefulness feedback is reported once per visit. The screen keeps
  // the acknowledgement locally: there is no server record of a report yet, so
  // hiding the control is the only confirmation the user gets.
  const [identityFlagged, setIdentityFlagged] = useState(false);
  const [hypothesisFlagged, setHypothesisFlagged] = useState(false);
  const [usefulness, setUsefulness] = useState<number | null>(null);
  // The star is answered by the server, but a tap has to look immediate, so
  // the screen shows the intended state and rolls back if the write fails.
  const [favorite, setFavorite] = useState(isFavorite);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  async function toggleFavorite() {
    if (!onToggleFavorite || favoriteBusy) return;
    const next = !favorite;
    setFavorite(next);
    setFavoriteBusy(true);
    try {
      await onToggleFavorite(next);
    } catch {
      setFavorite(!next);
    } finally {
      setFavoriteBusy(false);
    }
  }
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
    { label: "会話メモ", icon: "note", action: onViewInteraction },
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
      action={
        onToggleFavorite ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              favorite ? "お気に入りから外す" : "お気に入りに追加"
            }
            accessibilityState={{ selected: favorite }}
            disabled={favoriteBusy}
            onPress={() => void toggleFavorite()}
            style={({ pressed }) => [s.favoriteButton, pressed && s.pressed]}
          >
            <Icon
              name="star"
              color={favorite ? colors.accentStrong : colors.muted}
              filled={favorite}
              size={22}
            />
          </Pressable>
        ) : undefined
      }
      footer={
        <PrimaryButton
          label="Win-Winを詳しく見る"
          onPress={onViewMutualValue}
        />
      }
    >
      {/* The avatar is a placeholder icon, never a photo. At full size it
          pushed SAY THIS, the part read mid-conversation, below the fold. */}
      <View style={s.person}>
        <Avatar name={card.name} />
        <View style={s.personText}>
          <Text style={s.name}>{card.name || "名前未登録"}</Text>
          {card.company ? <Text style={s.body}>{card.company}</Text> : null}
          {card.title ? <Text style={s.body}>{card.title}</Text> : null}
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
      {onChangeMeetingGoal ? (
        <TextButton
          label="面談ゴールを変えて分析し直す"
          onPress={onChangeMeetingGoal}
        />
      ) : null}
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
        {/* The note does not depend on this analysis, so waiting for it (or
            its failing) must not keep the user from recording the meeting. */}
        <SecondaryButton
          label="先に会話を記録する"
          onPress={onViewInteraction}
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
            {/* SAY THIS on the brief is the opener. These are follow-ups that
                test a hypothesis, so they must not read as a second opener. */}
            <Text style={s.heading}>深掘りの質問（ASK）</Text>
            <Text style={s.caption}>
              会話が始まったら、仮説を確かめるために聞いてみましょう
            </Text>
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

const nextActionStatusLabels: Record<NextActionResponse["status"], string> = {
  accepted: "実行予定",
  completed: "完了",
  dismissed: "見送り",
  suggested: "提案中",
};

/** What this scan already has on record; null while it is being read. */
export type InteractionRecord = Readonly<{
  actions: NextActionResponse[];
  note: string | null;
}>;

type InteractionScreenProps = {
  card: Person;
  error: string | null;
  /** Set when the saved note or actions could not be read. */
  loadError?: string | null;
  /** Null until Mutual Value is ready; the note never waits for it. */
  mutualValue: MutualValuePublic | null;
  onAcceptNextAction: (
    actionText: string,
    timingText: string | null,
  ) => Promise<void>;
  onBack: () => void;
  onCompleteNextAction?: (actionId: string) => Promise<void>;
  onDismissNextAction: (actionText: string) => Promise<void>;
  onDone: () => void;
  onReload?: () => void;
  onSaveNote: (noteText: string) => Promise<void>;
  onSayThisUsed?: (used: boolean) => void;
  record: InteractionRecord | null;
  sayThis?: string[];
};

export function InteractionScreen(props: InteractionScreenProps) {
  const { card, loadError, onBack, onReload, record } = props;

  // Saving a note replaces the stored one, so the form must not open until the
  // stored note is known. An empty field over an unread note would silently
  // erase it on the next save.
  if (!record) {
    return (
      <ScreenFrame title="会話を記録" onBack={onBack}>
        {loadError ? (
          <>
            <ErrorNotice message={loadError} />
            {onReload ? (
              <SecondaryButton label="再読み込み" onPress={onReload} />
            ) : null}
          </>
        ) : (
          <Card>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={s.meta}>
              {card.name || "相手"}さんとの記録を読み込んでいます…
            </Text>
          </Card>
        )}
      </ScreenFrame>
    );
  }

  return <InteractionForm {...props} record={record} />;
}

function InteractionForm({
  card,
  error,
  mutualValue,
  onAcceptNextAction,
  onBack,
  onCompleteNextAction,
  onDismissNextAction,
  onDone,
  onSaveNote,
  onSayThisUsed,
  record,
  sayThis = [],
}: InteractionScreenProps & { record: InteractionRecord }) {
  const suggestion = mutualValue?.next_action ?? null;
  // One decision per scan. Offering the suggestion again on a later visit
  // recorded it a second time, and the old pre-ticked box counted every note
  // saved as an accepted AI suggestion.
  const decided = record.actions.length > 0;
  const [note, setNote] = useState(record.note ?? "");
  const [savedNote, setSavedNote] = useState(record.note?.trim() ?? "");
  const [decision, setDecision] = useState<"accepted" | "dismissed" | null>(
    null,
  );
  const [action, setAction] = useState(suggestion?.action ?? "");
  const [timing, setTiming] = useState(suggestion?.timing ?? "");
  const [actionSaved, setActionSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sayThisUsed, setSayThisUsed] = useState<boolean | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const settledActions = record.actions.filter(
    (item) => item.status === "completed" || item.status === "dismissed",
  );
  const openActions = record.actions.filter(
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
    if (decision === "accepted" && !action.trim()) {
      setLocalError("次にやることを入力してください。");
      return;
    }
    setSaving(true);
    setLocalError(null);
    try {
      const trimmedNote = note.trim();
      if (trimmedNote && trimmedNote !== savedNote) {
        await onSaveNote(trimmedNote);
        setSavedNote(trimmedNote);
      }
      if (!decided && !actionSaved) {
        if (suggestion && decision === "dismissed") {
          await onDismissNextAction(suggestion.action);
        } else if (
          (suggestion ? decision === "accepted" : true) &&
          action.trim()
        ) {
          await onAcceptNextAction(action.trim(), timing.trim() || null);
        }
        setActionSaved(true);
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

  const timingField = (
    <Field
      label="いつまでに"
      value={timing}
      onChangeText={setTiming}
      placeholder="例：今日中・3日以内"
      maxLength={200}
      editable={!saving}
    />
  );

  return (
    <ScreenFrame
      title="会話を記録"
      onBack={onBack}
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
        {record.note ? (
          <Text style={s.caption}>保存済みのメモを編集しています。</Text>
        ) : null}
      </View>
      {onSayThisUsed && sayThis.length > 0 ? (
        // Asked here, after the conversation, about the questions the user
        // actually saw first. It used to sit on the pre-conversation tab and
        // ask about a different list, which is not what the North Star counts.
        <Card>
          <Text style={s.heading}>Flash Briefの質問を会話で使いましたか？</Text>
          {sayThis.map((question, index) => (
            <Text key={`${question}-${index}`} style={s.caption}>
              {`・${question}`}
            </Text>
          ))}
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
      {!decided ? (
        <View style={s.section}>
          <Text style={s.heading}>次にやること（Next Action）</Text>
          {suggestion ? (
            <Card>
              <Text style={s.meta}>AIの提案</Text>
              <Text style={s.body}>{action}</Text>
              <Text style={s.caption}>{suggestion.reason}</Text>
              <View accessibilityRole="radiogroup" style={s.adoptionRow}>
                {(
                  [
                    ["accepted", "実行する"],
                    ["dismissed", "今回は見送る"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: decision === value,
                      disabled: saving,
                    }}
                    disabled={saving}
                    onPress={() =>
                      setDecision((current) =>
                        current === value ? null : value,
                      )
                    }
                    style={({ pressed }) => [
                      s.choice,
                      decision === value && s.choiceActive,
                      pressed && s.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        s.choiceText,
                        decision === value && s.choiceTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {decision === "accepted" ? (
                <>
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
                  {timingField}
                </>
              ) : null}
              {decision === null ? (
                <Text style={s.caption}>
                  選ばずに保存すると、メモだけが保存されます。
                </Text>
              ) : null}
            </Card>
          ) : (
            <Card>
              <Field
                label="次にやること（任意）"
                maxLength={2000}
                value={action}
                onChangeText={setAction}
                placeholder="例：事例資料を送る"
                multiline
                editable={!saving}
              />
              {action.trim() ? timingField : null}
            </Card>
          )}
        </View>
      ) : null}
      {record.actions.length > 0 ? (
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
  personText: { flex: 1, gap: 2 },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
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
  favoriteButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
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
  choice: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  choiceActive: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.accentStrong,
  },
  choiceText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  choiceTextActive: { color: "#FFFFFF" },
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
