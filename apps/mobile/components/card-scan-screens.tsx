import type {
  CardCorrection,
  CardFieldName,
  CardFields,
  EvidenceItem,
  EvidenceSourceType,
  ScanCreateResponse,
  ScanStatusResponse,
} from "@miraio/domain";
import { colors, spacing } from "@miraio/ui-tokens";
import { CameraView, useCameraPermissions } from "expo-camera";
import { launchImageLibraryAsync } from "expo-image-picker";
import { CameraFrame } from "./camera-frame";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { type CapturedCardImage } from "../lib/scan-capture";
import {
  Card,
  ErrorNotice,
  Field,
  PrimaryButton,
  ScreenFrame,
  SecondaryButton,
} from "./ui";

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
  const [torch, setTorch] = useState(false);
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

  async function selectImage() {
    setError(null);
    try {
      const selection = await launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      if (!asset) return;
      if (
        asset.mimeType !== "image/jpeg" &&
        !/\.jpe?g(?:$|\?)/i.test(asset.uri)
      ) {
        setError("JPEG形式の写真を選択してください。");
        return;
      }
      setCaptured({
        contentType: "image/jpeg",
        height: asset.height,
        width: asset.width,
        uri: asset.uri,
      });
    } catch {
      setError("写真を開けませんでした。再試行してください。");
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
    <CameraFrame
      onBack={onBack}
      onGallery={() => void selectImage()}
      onToggleTorch={() => setTorch(!torch)}
      torch={torch}
      onCapture={() => void capture()}
      disabled={!ready || capturing}
      capturing={capturing}
      error={error}
    >
      <CameraView
        enableTorch={torch}
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
    </CameraFrame>
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
    if (status?.card && !editing) {
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
    if (!status?.card || !draft || saving) {
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

export {
  FlashBriefScreen,
  MutualValueScreen,
  InteractionScreen,
} from "./relationship-screens";

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

const styles = StyleSheet.create({
  bodyText: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  cameraLoading: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
  },
  cameraLoadingText: { color: colors.muted, fontSize: 15 },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  confidenceText: { color: colors.muted, fontSize: 12 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
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
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: spacing.sm,
  },
  factValue: { color: colors.text, fontSize: 16, fontWeight: "700" },
  previewCard: {
    aspectRatio: 1.67,
    backgroundColor: "#111111",
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  previewImage: { height: "100%", width: "100%" },
  successMark: { color: colors.accent, fontSize: 48, fontWeight: "900" },
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
});
