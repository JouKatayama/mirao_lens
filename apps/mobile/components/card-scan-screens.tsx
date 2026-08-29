import type {
  CardCorrection,
  CardFieldName,
  CardFields,
  EvidenceItem,
  EvidenceSourceType,
  FlashBriefPublic,
  MeetingGoal,
  MutualValuePublic,
  PersonalContextProfile,
  ScanCreateResponse,
  ScanHistoryItem,
  ScanHistoryStatus,
  ScanStatusResponse,
} from "@miraio/domain";
import { colors, spacing } from "@miraio/ui-tokens";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  meetingGoalOptions,
  type CapturedCardImage,
} from "../lib/scan-capture";
import {
  Card,
  ErrorNotice,
  Field,
  PrimaryButton,
  ScreenFrame,
  SecondaryButton,
} from "./ui";

export function HomeScanScreen({
  contextItemCount,
  meetingGoal,
  onMeetingGoalChange,
  onOpenContext,
  onSignOut,
  onStartCapture,
  onViewHistory,
  profile,
}: {
  contextItemCount: number;
  meetingGoal: MeetingGoal;
  onMeetingGoalChange: (meetingGoal: MeetingGoal) => void;
  onOpenContext: () => void;
  onSignOut: () => Promise<void>;
  onStartCapture: () => void;
  onViewHistory: () => void;
  profile: PersonalContextProfile;
}) {
  return (
    <ScreenFrame
      subtitle="名刺をきっかけに、あなたとの接点をすばやく見つけます。"
      title="Home / Scan"
    >
      <Card>
        <Text style={styles.eyebrow}>PRIVATE SCAN</Text>
        <Text style={styles.cardTitle}>名刺の表面を撮影</Text>
        <Text style={styles.bodyText}>
          画像は非公開で一時保存されます。裏面の撮影は必要ありません。
        </Text>
        <Text style={styles.sectionLabel}>今回の目的</Text>
        <View accessibilityRole="radiogroup" style={styles.goalOptions}>
          {meetingGoalOptions.map((option) => {
            const selected = option.value === meetingGoal;

            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.value}
                onPress={() => onMeetingGoalChange(option.value)}
                style={[
                  styles.goalOption,
                  selected ? styles.goalOptionSelected : null,
                ]}
              >
                <Text
                  style={
                    selected
                      ? styles.goalOptionTextSelected
                      : styles.goalOptionText
                  }
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <PrimaryButton label="名刺を撮影する" onPress={onStartCapture} />
      </Card>
      <Card>
        <Text style={styles.sectionLabel}>あなたのContext</Text>
        <Text style={styles.contextSummary}>
          {profile.current_role || "役割未設定"} ・ 承認済み{contextItemCount}件
        </Text>
        <SecondaryButton label="My Contextを確認" onPress={onOpenContext} />
      </Card>
      <Card>
        <Text style={styles.sectionLabel}>過去のミーティング</Text>
        <SecondaryButton label="スキャン履歴を確認" onPress={onViewHistory} />
      </Card>
      <SecondaryButton label="ログアウト" onPress={() => void onSignOut()} />
    </ScreenFrame>
  );
}

function PermissionScreen({
  canAskAgain,
  error,
  onBack,
  onRefresh,
  onRequest,
}: {
  canAskAgain: boolean;
  error: string | null;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onRequest: () => Promise<void>;
}) {
  return (
    <ScreenFrame
      subtitle="許可は撮影を始めるときだけお願いしています。撮影画像は公開されません。"
      title="カメラを使用します"
    >
      <Card>
        <Text style={styles.cardTitle}>名刺の表面を枠に合わせて撮影</Text>
        <Text style={styles.bodyText}>
          撮影後に画像を確認し、アップロード前なら何度でも撮り直せます。
        </Text>
        <ErrorNotice message={error} />
        {canAskAgain ? (
          <PrimaryButton
            label="カメラを許可"
            onPress={() => void onRequest()}
          />
        ) : (
          <>
            <PrimaryButton
              label="端末の設定を開く"
              onPress={() => void Linking.openSettings()}
            />
            <SecondaryButton
              label="許可状態を再確認"
              onPress={() => void onRefresh()}
            />
          </>
        )}
        <SecondaryButton label="戻る" onPress={onBack} />
      </Card>
    </ScreenFrame>
  );
}

export function CardCaptureScreen({
  onAccepted,
  onBack,
  onUpload,
  scanId,
}: {
  onAccepted: (result: ScanCreateResponse) => void;
  onBack: () => void;
  onUpload: (
    captured: CapturedCardImage,
    scanId: string,
  ) => Promise<ScanCreateResponse>;
  scanId: string;
}) {
  const camera = useRef<CameraView | null>(null);
  const [permission, requestPermission, refreshPermission] =
    useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [captured, setCaptured] = useState<CapturedCardImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestCameraPermission() {
    setError(null);

    try {
      await requestPermission();
    } catch {
      setError("カメラの許可状態を更新できませんでした。再試行してください。");
    }
  }

  async function refreshCameraPermission() {
    setError(null);

    try {
      await refreshPermission();
    } catch {
      setError("カメラの許可状態を確認できませんでした。再試行してください。");
    }
  }

  async function capture() {
    if (!ready || capturing || !camera.current) {
      return;
    }

    setCapturing(true);
    setError(null);

    try {
      const picture = await camera.current.takePictureAsync({
        exif: false,
        quality: 0.8,
        skipProcessing: false,
      });

      if (!picture) {
        throw new Error("No picture returned.");
      }

      setCaptured({
        contentType: "image/jpeg",
        height: picture.height,
        uri: picture.uri,
        width: picture.width,
      });
    } catch {
      setError("撮影できませんでした。カメラを確認して再試行してください。");
    } finally {
      setCapturing(false);
    }
  }

  async function upload() {
    if (!captured || uploading) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      onAccepted(await onUpload(captured, scanId));
    } catch {
      setError(
        "画像をアップロードできませんでした。撮影内容を保ったまま再試行できます。",
      );
    } finally {
      setUploading(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.cameraLoading}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.cameraLoadingText}>カメラを確認中...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <PermissionScreen
        canAskAgain={permission.canAskAgain}
        error={error}
        onBack={onBack}
        onRefresh={refreshCameraPermission}
        onRequest={requestCameraPermission}
      />
    );
  }

  if (captured) {
    return (
      <ScreenFrame
        subtitle="文字が読め、カード全体が写っていることを確認してください。"
        title="撮影内容を確認"
      >
        <View style={styles.previewCard}>
          <Image
            accessibilityLabel="撮影した名刺のプレビュー"
            resizeMode="contain"
            source={{ uri: captured.uri }}
            style={styles.previewImage}
          />
        </View>
        <ErrorNotice message={error} />
        <PrimaryButton
          label="この画像をアップロード"
          loading={uploading}
          onPress={() => void upload()}
        />
        <SecondaryButton
          disabled={uploading}
          label="撮り直す"
          onPress={() => {
            setCaptured(null);
            setError(null);
            setReady(false);
          }}
        />
        <SecondaryButton
          disabled={uploading}
          label="キャンセル"
          onPress={onBack}
        />
      </ScreenFrame>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        facing="back"
        mode="picture"
        onCameraReady={() => setReady(true)}
        onMountError={() =>
          setError(
            "カメラを起動できませんでした。端末の設定を確認してください。",
          )
        }
        ref={camera}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.cameraShade} />
      <View pointerEvents="none" style={styles.cardFrame}>
        <Text style={styles.frameLabel}>名刺の表面を枠に合わせる</Text>
      </View>
      <Pressable
        accessibilityLabel="撮影をやめて戻る"
        accessibilityRole="button"
        onPress={onBack}
        style={styles.cameraBack}
      >
        <Text style={styles.cameraBackText}>戻る</Text>
      </Pressable>
      <View style={styles.captureControls}>
        <ErrorNotice message={error} />
        <Pressable
          accessibilityLabel="名刺を撮影"
          accessibilityRole="button"
          disabled={!ready || capturing}
          onPress={() => void capture()}
          style={[
            styles.shutterOuter,
            !ready || capturing ? styles.shutterDisabled : null,
          ]}
        >
          {capturing ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const cardFieldLabels: Record<CardFieldName, string> = {
  address: "住所",
  company: "会社",
  department: "部署",
  email: "メール",
  name: "氏名",
  phone: "電話",
  title: "役職",
  website: "Webサイト",
};

export function CardIntelligenceScreen({
  error,
  onCorrect,
  onDone,
  onRecapture,
  onRefresh,
  onRetry,
  result,
  status,
}: {
  error: string | null;
  onCorrect: (correction: CardCorrection) => Promise<void>;
  onDone: () => void;
  onRecapture: () => void;
  onRefresh: () => Promise<void>;
  onRetry: () => Promise<void>;
  result: ScanCreateResponse;
  status: ScanStatusResponse | null;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [draft, setDraft] = useState<Record<CardFieldName, string> | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (status?.status === "card_ready" && !editing) {
      setDraft(
        Object.fromEntries(
          Object.keys(cardFieldLabels).map((field) => [
            field,
            status.card[field as CardFieldName] ?? "",
          ]),
        ) as Record<CardFieldName, string>,
      );
    }
  }, [editing, status]);

  async function saveCorrections() {
    if (status?.status !== "card_ready" || !draft || saving) {
      return;
    }

    const correction: Partial<CardFields> = {};

    for (const field of Object.keys(cardFieldLabels) as CardFieldName[]) {
      const value = draft[field].trim() || null;

      if (value !== status.card[field]) {
        correction[field] = value;
      }
    }

    if (Object.keys(correction).length === 0) {
      setLocalError("変更された項目がありません。");
      return;
    }

    setSaving(true);
    setLocalError(null);

    try {
      await onCorrect(correction as CardCorrection);
      setEditing(false);
    } catch {
      setLocalError("修正を保存できませんでした。再試行してください。");
    } finally {
      setSaving(false);
    }
  }

  async function retryExtraction() {
    if (retrying) {
      return;
    }

    setRetrying(true);
    setLocalError(null);

    try {
      await onRetry();
    } catch {
      setLocalError(
        "同じ画像で再試行できませんでした。新しく撮影してください。",
      );
    } finally {
      setRetrying(false);
    }
  }

  if (!status || status.status === "extracting") {
    return (
      <ScreenFrame
        subtitle="画像は非公開のまま処理され、抽出後に削除されます。"
        title="名刺を読み取りました"
      >
        <Card>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.cardTitle}>会社・役職を確認しています</Text>
          <Text style={styles.bodyText}>
            Scan ID: {result.scan_id.slice(0, 8)}…
          </Text>
        </Card>
        <ErrorNotice message={error} />
        <SecondaryButton
          label="状態を再確認"
          onPress={() => void onRefresh()}
        />
        <SecondaryButton label="Homeへ戻る" onPress={onDone} />
      </ScreenFrame>
    );
  }

  if (status.status === "generating_brief") {
    return (
      <ScreenFrame
        subtitle="名刺の内容とあなたのContextをもとに関係性を分析しています。"
        title="Flash Briefを生成中"
      >
        <Card>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.cardTitle}>
            {status.card.name ?? "相手"}さんとの接点を分析中…
          </Text>
          <Text style={styles.bodyText}>
            {status.card.company ?? "会社名未取得"} /{" "}
            {status.card.title ?? "役職未取得"}
          </Text>
        </Card>
        <ErrorNotice message={error} />
        <SecondaryButton
          label="状態を再確認"
          onPress={() => void onRefresh()}
        />
        <SecondaryButton label="Homeへ戻る" onPress={onDone} />
      </ScreenFrame>
    );
  }

  if (
    status.status === "failed_retryable" ||
    status.status === "failed_terminal"
  ) {
    const retryable = status.status === "failed_retryable";

    return (
      <ScreenFrame
        subtitle="名刺の内容やプロバイダー詳細はエラー表示・ログに含まれません。"
        title={retryable ? "読み取りを再試行できます" : "撮り直してください"}
      >
        <ErrorNotice
          message={
            localError ??
            error ??
            (retryable
              ? "一時的に名刺を読み取れませんでした。同じ画像で再試行できます。"
              : "画像を読み取れませんでした。新しく撮影してください。")
          }
        />
        {retryable ? (
          <PrimaryButton
            label="同じ画像で再試行"
            loading={retrying}
            onPress={() => void retryExtraction()}
          />
        ) : null}
        <SecondaryButton label="新しく撮影" onPress={onRecapture} />
        <SecondaryButton label="Homeへ戻る" onPress={onDone} />
      </ScreenFrame>
    );
  }

  if (
    status.status !== "card_ready" &&
    status.status !== "brief_ready" &&
    status.status !== "deep_enrichment" &&
    status.status !== "deep_ready"
  ) {
    return null;
  }

  const card = status.card;

  return (
    <ScreenFrame
      subtitle="表示内容は名刺画像から読み取ったFACTです。推測や公開情報は含みません。"
      title="名刺の内容を確認"
    >
      <Card>
        <Text style={styles.successMark}>✓</Text>
        <Text style={styles.factBadge}>FACT / 名刺</Text>
        {editing && draft
          ? (Object.keys(cardFieldLabels) as CardFieldName[]).map((field) => (
              <Field
                key={field}
                label={cardFieldLabels[field]}
                onChangeText={(value) =>
                  setDraft((current) =>
                    current ? { ...current, [field]: value } : current,
                  )
                }
                value={draft[field]}
              />
            ))
          : (Object.keys(cardFieldLabels) as CardFieldName[]).map((field) => (
              <View key={field} style={styles.factRow}>
                <Text style={styles.factLabel}>{cardFieldLabels[field]}</Text>
                <Text style={styles.factValue}>{card[field] ?? "未記載"}</Text>
                <Text style={styles.confidenceText}>
                  信頼度 {Math.round(card.field_confidence[field] * 100)}%
                </Text>
              </View>
            ))}
      </Card>
      <ErrorNotice message={localError ?? error} />
      {editing ? (
        <>
          <PrimaryButton
            label="修正を保存"
            loading={saving}
            onPress={() => void saveCorrections()}
          />
          <SecondaryButton
            disabled={saving}
            label="キャンセル"
            onPress={() => {
              setEditing(false);
              setLocalError(null);
            }}
          />
        </>
      ) : (
        <PrimaryButton label="内容を修正" onPress={() => setEditing(true)} />
      )}
      <SecondaryButton label="Homeへ戻る" onPress={onDone} />
    </ScreenFrame>
  );
}

const identityStatusLabels: Record<
  FlashBriefPublic["identity_status"],
  { label: string; style: "verified" | "high" | "medium" | "unresolved" }
> = {
  high_confidence: { label: "HIGH", style: "high" },
  medium_confidence: { label: "MEDIUM", style: "medium" },
  unresolved: { label: "UNRESOLVED", style: "unresolved" },
  verified: { label: "VERIFIED", style: "verified" },
};

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
}: {
  brief: FlashBriefPublic;
  card: { name: string | null; company: string | null; title: string | null };
  deepEnriching: boolean;
  error: string | null;
  onDone: () => void;
  onRefresh: () => Promise<void>;
  onViewCard: () => void;
  onViewEvidence: () => void;
  onViewMutualValue: () => void;
}) {
  const identityInfo = identityStatusLabels[brief.identity_status];

  return (
    <ScreenFrame
      subtitle="名刺 × あなたのContextから生成したFLASH BRIEFです。AIによる推測を含む場合があります。"
      title="Flash Brief"
    >
      <Card>
        <Text style={styles.eyebrow}>FLASH BRIEF</Text>
        <Text style={styles.cardTitle}>
          {card.name ?? "（名前なし）"}
        </Text>
        <Text style={styles.bodyText}>
          {[card.company, card.title].filter(Boolean).join(" / ")}
        </Text>
        <View style={styles.identityRow}>
          <Text style={styles.identityLabel}>ID信頼度</Text>
          <View
            style={[
              styles.identityBadge,
              identityInfo.style === "verified" && styles.identityBadgeVerified,
              identityInfo.style === "high" && styles.identityBadgeHigh,
              identityInfo.style === "medium" && styles.identityBadgeMedium,
              identityInfo.style === "unresolved" &&
                styles.identityBadgeUnresolved,
            ]}
          >
            <Text style={styles.identityBadgeText}>{identityInfo.label}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>WHO</Text>
        <Text style={styles.briefSectionText}>{brief.who}</Text>
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>WHY YOU</Text>
        <Text style={styles.briefSectionText}>{brief.why_you}</Text>
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>SAY THIS</Text>
        {brief.say_this.map((starter, index) => (
          <View key={index} style={styles.starterRow}>
            <Text style={styles.starterBullet}>▶</Text>
            <Text style={styles.starterText}>{starter}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>POTENTIAL</Text>
        <Text style={styles.briefSectionText}>{brief.potential}</Text>
      </Card>

      <ErrorNotice message={error} />
      <PrimaryButton
        label={deepEnriching ? "Win-Winを分析中…" : "Win-Winを詳しく見る"}
        loading={deepEnriching}
        onPress={onViewMutualValue}
      />
      <SecondaryButton label="根拠・ソースを確認" onPress={onViewEvidence} />
      <SecondaryButton label="名刺の詳細を確認" onPress={onViewCard} />
      <SecondaryButton
        label="状態を再確認"
        onPress={() => void onRefresh()}
      />
      <SecondaryButton label="Homeへ戻る" onPress={onDone} />
    </ScreenFrame>
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
}: {
  card: { name: string | null; company: string | null; title: string | null };
  error: string | null;
  mutualValue: MutualValuePublic | null;
  onDone: () => void;
  onRefresh: () => Promise<void>;
  onViewBrief: () => void;
  onViewInteraction: () => void;
}) {
  if (!mutualValue) {
    return (
      <ScreenFrame
        subtitle="Win-Win分析を準備しています。しばらくお待ちください。"
        title="Mutual Value"
      >
        <Card>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.cardTitle}>
            {card.name ?? "相手"}さんとのWin-Winを分析中…
          </Text>
          <Text style={styles.bodyText}>
            {[card.company, card.title].filter(Boolean).join(" / ")}
          </Text>
        </Card>
        <ErrorNotice message={error} />
        <SecondaryButton
          label="状態を再確認"
          onPress={() => void onRefresh()}
        />
        <SecondaryButton label="Flash Briefに戻る" onPress={onViewBrief} />
        <SecondaryButton label="Homeへ戻る" onPress={onDone} />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      subtitle="名刺 × あなたのContextから生成したMUTUAL VALUEです。AIによる推測を含む場合があります。"
      title="Mutual Value"
    >
      <Card>
        <Text style={styles.eyebrow}>MUTUAL VALUE</Text>
        <Text style={styles.cardTitle}>
          {card.name ?? "（名前なし）"}
        </Text>
        <Text style={styles.bodyText}>
          {[card.company, card.title].filter(Boolean).join(" / ")}
        </Text>
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>GIVE</Text>
        {mutualValue.give.map((item, index) => (
          <View key={index} style={styles.mutualValueRow}>
            <View style={styles.mutualValueRowHeader}>
              <Text
                style={[
                  styles.claimTypeBadge,
                  item.claim_type === "fact"
                    ? styles.claimTypeBadgeFact
                    : styles.claimTypeBadgeHypothesis,
                ]}
              >
                {item.claim_type === "fact" ? "事実" : "仮説"}
              </Text>
            </View>
            <Text style={styles.briefSectionText}>{item.text}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>GET</Text>
        {mutualValue.get.map((item, index) => (
          <View key={index} style={styles.mutualValueRow}>
            <View style={styles.mutualValueRowHeader}>
              <Text
                style={[
                  styles.claimTypeBadge,
                  item.claim_type === "fact"
                    ? styles.claimTypeBadgeFact
                    : styles.claimTypeBadgeHypothesis,
                ]}
              >
                {item.claim_type === "fact" ? "事実" : "仮説"}
              </Text>
            </View>
            <Text style={styles.briefSectionText}>{item.text}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>BRIDGE</Text>
        <Text style={styles.briefSectionText}>{mutualValue.bridge}</Text>
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>ASK</Text>
        {mutualValue.ask.map((item, index) => (
          <View key={index} style={styles.askRow}>
            <Text style={styles.askBullet}>?</Text>
            <View style={styles.askContent}>
              <Text style={styles.askQuestion}>{item.question}</Text>
              {item.validates_hypothesis ? (
                <Text style={styles.askValidates}>
                  → {item.validates_hypothesis}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>NEXT</Text>
        <Text style={styles.briefSectionText}>{mutualValue.next_action.action}</Text>
        {mutualValue.next_action.timing ? (
          <Text style={styles.mutualValueMeta}>
            ⏱ {mutualValue.next_action.timing}
          </Text>
        ) : null}
        <Text style={styles.mutualValueReason}>{mutualValue.next_action.reason}</Text>
      </Card>

      <ErrorNotice message={error} />
      <PrimaryButton label="メモ & ネクストアクションを記録" onPress={onViewInteraction} />
      <SecondaryButton label="Flash Briefに戻る" onPress={onViewBrief} />
      <SecondaryButton
        label="状態を再確認"
        onPress={() => void onRefresh()}
      />
      <SecondaryButton label="Homeへ戻る" onPress={onDone} />
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
  card: { name: string | null; company: string | null; title: string | null };
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
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [actionState, setActionState] = useState<
    "idle" | "editing" | "saved" | "dismissed"
  >("idle");
  const [editActionText, setEditActionText] = useState(
    mutualValue.next_action.action,
  );
  const [actionSaving, setActionSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function saveNote() {
    const trimmed = noteText.trim();

    if (!trimmed) {
      return;
    }

    setNoteSaving(true);
    setLocalError(null);

    try {
      await onSaveNote(trimmed);
      setNoteSaved(true);
    } catch {
      setLocalError("メモを保存できませんでした。再試行してください。");
    } finally {
      setNoteSaving(false);
    }
  }

  async function acceptAction() {
    const text =
      actionState === "editing"
        ? editActionText.trim()
        : mutualValue.next_action.action;
    const timing = mutualValue.next_action.timing;

    setActionSaving(true);
    setLocalError(null);

    try {
      await onAcceptNextAction(text, timing);
      setActionState("saved");
    } catch {
      setLocalError(
        "ネクストアクションを保存できませんでした。再試行してください。",
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function dismissAction() {
    setActionSaving(true);
    setLocalError(null);

    try {
      await onDismissNextAction(mutualValue.next_action.action);
      setActionState("dismissed");
    } catch {
      setLocalError(
        "ネクストアクションを保存できませんでした。再試行してください。",
      );
    } finally {
      setActionSaving(false);
    }
  }

  return (
    <ScreenFrame
      subtitle="商談の気づきとネクストアクションを記録してください。メモはあなただけに表示されます。"
      title="メモ & ネクスト"
    >
      <Card>
        <Text style={styles.eyebrow}>MEETING NOTE</Text>
        <Text style={styles.bodyText}>
          {card.name ?? "（名前なし）"}
          {[card.company, card.title].filter(Boolean).length > 0
            ? ` / ${[card.company, card.title].filter(Boolean).join(" · ")}`
            : ""}
        </Text>
        <TextInput
          maxLength={4000}
          multiline
          onChangeText={(text) => {
            setNoteText(text);
            setNoteSaved(false);
          }}
          placeholder="この商談の気づき・印象をメモ…"
          placeholderTextColor={colors.muted}
          style={styles.noteInput}
          value={noteText}
        />
        <PrimaryButton
          label={noteSaved ? "保存済み ✓" : "メモを保存"}
          loading={noteSaving}
          onPress={() => void saveNote()}
        />
      </Card>

      <Card>
        <Text style={styles.briefSectionLabel}>NEXT ACTION</Text>
        {actionState === "saved" ? (
          <Text style={styles.briefSectionText}>✓ 承認して保存しました</Text>
        ) : actionState === "dismissed" ? (
          <Text style={styles.briefSectionText}>見送りました</Text>
        ) : actionState === "editing" ? (
          <>
            <TextInput
              maxLength={2000}
              multiline
              onChangeText={setEditActionText}
              style={styles.noteInput}
              value={editActionText}
            />
            <PrimaryButton
              label="この内容で承認"
              loading={actionSaving}
              onPress={() => void acceptAction()}
            />
            <SecondaryButton
              disabled={actionSaving}
              label="キャンセル"
              onPress={() => setActionState("idle")}
            />
          </>
        ) : (
          <>
            <Text style={styles.briefSectionText}>
              {mutualValue.next_action.action}
            </Text>
            {mutualValue.next_action.timing ? (
              <Text style={styles.mutualValueMeta}>
                ⏱ {mutualValue.next_action.timing}
              </Text>
            ) : null}
            <Text style={styles.mutualValueReason}>
              {mutualValue.next_action.reason}
            </Text>
            <PrimaryButton
              label="そのまま承認"
              loading={actionSaving}
              onPress={() => void acceptAction()}
            />
            <SecondaryButton
              disabled={actionSaving}
              label="内容を編集して承認"
              onPress={() => setActionState("editing")}
            />
            <SecondaryButton
              disabled={actionSaving}
              label="見送る"
              onPress={() => void dismissAction()}
            />
          </>
        )}
      </Card>

      <ErrorNotice message={localError ?? error} />
      <SecondaryButton label="Mutual Valueに戻る" onPress={onViewMutualValue} />
      <SecondaryButton label="Homeへ戻る" onPress={onDone} />
    </ScreenFrame>
  );
}

const evidenceFieldLabels: Record<string, string> = {
  "card.address": "住所",
  "card.company": "会社名",
  "card.department": "部署",
  "card.email": "メール",
  "card.name": "氏名",
  "card.phone": "電話",
  "card.title": "役職",
  "card.website": "Web",
};

const evidenceSourceLabels: Record<EvidenceSourceType, string> = {
  ai_inference: "AI推論",
  business_card: "名刺",
  official_company: "公式会社情報",
  public_web: "Web情報",
  user_context: "マイContext",
  user_correction: "ユーザー修正",
};

export function EvidenceScreen({
  card,
  error,
  items,
  onBack,
}: {
  card: { name: string | null; company: string | null; title: string | null };
  error: string | null;
  items: EvidenceItem[] | null;
  onBack: () => void;
}) {
  const groups =
    items !== null
      ? Object.entries(
          items.reduce<Record<string, EvidenceItem[]>>((acc, item) => {
            const key = item.source_type;
            acc[key] = [...(acc[key] ?? []), item];
            return acc;
          }, {}),
        )
      : [];

  return (
    <ScreenFrame
      subtitle="名刺から読み取ったデータとその信頼度を確認できます。"
      title="根拠・ソース"
    >
      <Card>
        <Text style={styles.eyebrow}>EVIDENCE</Text>
        <Text style={styles.cardTitle}>{card.name ?? "（名前なし）"}</Text>
        <Text style={styles.bodyText}>
          {[card.company, card.title].filter(Boolean).join(" / ")}
        </Text>
      </Card>

      {items === null ? (
        <Card>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.bodyText}>読み込み中…</Text>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <Text style={styles.bodyText}>根拠データがありません。</Text>
        </Card>
      ) : (
        groups.map(([sourceType, groupItems]) => (
          <Card key={sourceType}>
            <Text style={styles.evidenceSourceLabel}>
              {evidenceSourceLabels[sourceType as EvidenceSourceType] ??
                sourceType}
            </Text>
            {groupItems.map((item) => (
              <View key={item.id} style={styles.evidenceRow}>
                <Text style={styles.evidenceFieldName}>
                  {item.source_title !== null
                    ? (evidenceFieldLabels[item.source_title] ??
                      item.source_title)
                    : "—"}
                </Text>
                <Text
                  style={styles.evidenceExcerpt}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.excerpt ?? "—"}
                </Text>
                <Text style={styles.evidenceConfidence}>
                  {Math.round(item.confidence * 100)}%
                </Text>
              </View>
            ))}
          </Card>
        ))
      )}

      <ErrorNotice message={error} />
      <SecondaryButton label="Flash Briefに戻る" onPress={onBack} />
    </ScreenFrame>
  );
}

const historyStatusLabels: Record<ScanHistoryStatus, string> = {
  brief_ready: "Brief完成",
  deep_enrichment: "分析中",
  deep_ready: "完了",
  failed: "失敗",
  processing: "処理中",
};

const historyStatusBg: Record<ScanHistoryStatus, string> = {
  brief_ready: "#D1FAE5",
  deep_enrichment: "#DBEAFE",
  deep_ready: "#D1FAE5",
  failed: "#FEE2E2",
  processing: "#FEF3C7",
};

export function HistoryScreen({
  error,
  items,
  onBack,
  onDeleteScan,
  onOpenScan,
}: {
  error: string | null;
  items: ScanHistoryItem[] | null;
  onBack: () => void;
  onDeleteScan?: (scanId: string) => Promise<void>;
  onOpenScan: (scanId: string) => void;
}) {
  return (
    <ScreenFrame
      subtitle="過去にスキャンした名刺の履歴を確認できます。"
      title="スキャン履歴"
    >
      {items === null ? (
        <Card>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.bodyText}>読み込み中…</Text>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <Text style={styles.bodyText}>スキャン履歴がありません。</Text>
        </Card>
      ) : (
        items.map((item) => (
          <Pressable key={item.scan_id} onPress={() => onOpenScan(item.scan_id)}>
            <Card>
              <View style={styles.historyRow}>
                <View style={styles.historyMain}>
                  <Text style={styles.historyName}>
                    {item.card_name ?? "（名前なし）"}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {[item.card_company, item.card_title]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(item.created_at).toLocaleDateString("ja-JP")}
                  </Text>
                </View>
                <View
                  style={[
                    styles.historyStatusBadge,
                    { backgroundColor: historyStatusBg[item.status] },
                  ]}
                >
                  <Text style={styles.historyStatusText}>
                    {historyStatusLabels[item.status]}
                  </Text>
                </View>
                {onDeleteScan ? (
                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        "スキャンを削除",
                        "このスキャンと関連データをすべて削除します。この操作は取り消せません。",
                        [
                          { style: "cancel", text: "キャンセル" },
                          {
                            onPress: () => {
                              void onDeleteScan(item.scan_id).catch(() => {});
                            },
                            style: "destructive",
                            text: "削除",
                          },
                        ],
                      );
                    }}
                    style={styles.historyDeleteButton}
                  >
                    <Text style={styles.historyDeleteIcon}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          </Pressable>
        ))
      )}
      <ErrorNotice message={error} />
      <SecondaryButton label="戻る" onPress={onBack} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  bodyText: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  cameraBack: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 999,
    left: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    position: "absolute",
    top: spacing.lg,
    justifyContent: "center",
  },
  cameraBackText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  cameraContainer: { backgroundColor: "#000000", flex: 1 },
  cameraLoading: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
  },
  cameraLoadingText: { color: colors.muted, fontSize: 15 },
  cameraShade: {
    backgroundColor: "rgba(0, 0, 0, 0.12)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  captureControls: {
    alignItems: "center",
    bottom: spacing.xl,
    gap: spacing.md,
    left: spacing.lg,
    position: "absolute",
    right: spacing.lg,
  },
  cardFrame: {
    alignItems: "center",
    aspectRatio: 1.67,
    borderColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 3,
    justifyContent: "flex-start",
    left: "6%",
    position: "absolute",
    top: "25%",
    width: "88%",
  },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  contextSummary: { color: colors.text, fontSize: 16, fontWeight: "700" },
  confidenceText: { color: colors.muted, fontSize: 12 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  frameLabel: {
    backgroundColor: "rgba(0, 0, 0, 0.58)",
    borderRadius: 999,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    marginTop: -34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  factBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E1F4EA",
    borderRadius: 999,
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  factLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  factRow: {
    borderBottomColor: "#E7ECE9",
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: spacing.sm,
  },
  factValue: { color: colors.text, fontSize: 16, fontWeight: "700" },
  goalOption: {
    backgroundColor: "#FFFFFF",
    borderColor: "#B8C7BF",
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  goalOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  goalOptionText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  goalOptionTextSelected: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  goalOptions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  previewCard: {
    aspectRatio: 1.67,
    backgroundColor: "#111111",
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  previewImage: { height: "100%", width: "100%" },
  sectionLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  shutterDisabled: { opacity: 0.5 },
  shutterInner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    height: 58,
    width: 58,
  },
  shutterOuter: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.45)",
    borderRadius: 999,
    height: 74,
    justifyContent: "center",
    width: 74,
  },
  successMark: { color: colors.accent, fontSize: 48, fontWeight: "900" },
  briefSectionLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  briefSectionText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  starterRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: 4 },
  starterBullet: { color: colors.accent, fontSize: 13, fontWeight: "900", marginTop: 2 },
  starterText: { color: colors.text, flex: 1, fontSize: 15, lineHeight: 22 },
  claimTypeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  claimTypeBadgeFact: {
    backgroundColor: "#D1FAE5",
    color: "#065F46",
  },
  claimTypeBadgeHypothesis: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
  },
  mutualValueRow: { gap: 6, paddingVertical: spacing.sm },
  mutualValueRowHeader: { flexDirection: "row" },
  askRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: 6,
  },
  askBullet: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 1,
    width: 14,
  },
  askContent: { flex: 1, gap: 4 },
  askQuestion: {
    color: colors.text,
    fontSize: 15,
    fontStyle: "italic",
    lineHeight: 22,
  },
  askValidates: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  mutualValueMeta: { color: colors.muted, fontSize: 13, marginTop: spacing.sm },
  mutualValueReason: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  noteInput: {
    borderColor: "#B8C7BF",
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginVertical: spacing.sm,
    minHeight: 100,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  identityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  identityLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  identityBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  identityBadgeVerified: { backgroundColor: "#DBEAFE" },
  identityBadgeHigh: { backgroundColor: "#D1FAE5" },
  identityBadgeMedium: { backgroundColor: "#FEF3C7" },
  identityBadgeUnresolved: { backgroundColor: "#F3F4F6" },
  identityBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  evidenceConfidence: {
    color: colors.muted,
    fontSize: 13,
    minWidth: 36,
    textAlign: "right",
  },
  evidenceExcerpt: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    marginHorizontal: 8,
  },
  evidenceFieldName: { color: colors.muted, fontSize: 13, minWidth: 60 },
  evidenceRow: {
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 4,
  },
  evidenceSourceLabel: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  historyDate: { color: colors.muted, fontSize: 12, marginTop: 2 },
  historyMain: { flex: 1, gap: 2 },
  historyMeta: { color: colors.muted, fontSize: 13 },
  historyName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  historyRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  historyStatusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  historyStatusText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  historyDeleteButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
    minWidth: 32,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
  },
  historyDeleteIcon: { color: "#DC2626", fontSize: 13, fontWeight: "800" },
});
