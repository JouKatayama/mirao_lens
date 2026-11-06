import type { FollowUpRecommendation } from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  buildFollowUpMailto,
  followUpDecisionLabels,
  formatFollowUpShareText,
} from "../lib/follow-up-handoff";
import type { RelationshipApiClient } from "../lib/relationship-api";
import {
  Card,
  ErrorNotice,
  Field,
  PrimaryButton,
  SecondaryButton,
  TextButton,
} from "./ui";

const sourceLabels: Record<
  FollowUpRecommendation["reasons"][number]["source"],
  string
> = {
  card: "名刺",
  connection: "つながり",
  encounter_history: "過去の接点",
  meeting_goal: "目的",
  mutual_value: "分析",
  next_action: "Next Action",
  note: "会話メモ",
};

/**
 * Whether to follow up after this encounter (spec §2.4, extension 5).
 *
 * The AI judges and drafts; the user approves, edits or dismisses. Approval
 * only opens the device's own compose screen or share sheet — the app never
 * sends a message.
 */
export function FollowUpCard({
  accessToken,
  client,
  personName,
  scanId,
}: {
  accessToken: string;
  client: RelationshipApiClient;
  personName: string | null;
  scanId: string;
}) {
  const [recommendation, setRecommendation] =
    useState<FollowUpRecommendation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const adopt = useCallback((next: FollowUpRecommendation | null) => {
    setRecommendation(next);
    setSubject(next?.draft?.subject ?? "");
    setBody(next?.draft?.body ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    void client
      .getFollowUp(accessToken, scanId)
      .then((response) => {
        if (active) adopt(response.recommendation);
      })
      .catch(() => {
        if (active) setError("フォローアップの判定を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [accessToken, adopt, client, scanId]);

  const judge = async () => {
    setWorking(true);
    setError(null);
    try {
      adopt((await client.requestFollowUp(accessToken, scanId)).recommendation);
    } catch {
      setError(
        "判定できませんでした。少し時間をおいて、もう一度お試しください。",
      );
    } finally {
      setWorking(false);
    }
  };

  const approve = async () => {
    if (!recommendation) return;
    const draft =
      recommendation.decision === "follow_up" && subject.trim() && body.trim()
        ? { body: body.trim(), subject: subject.trim() }
        : undefined;

    setWorking(true);
    setError(null);
    try {
      const response = await client.decideFollowUp(accessToken, scanId, {
        status: "approved",
        ...(draft ? { draft } : {}),
      });
      adopt(response.recommendation);

      // The hand-off: the user's own mail app or share sheet does the sending.
      if (draft) {
        const mailto = buildFollowUpMailto(
          recommendation.recipient_email,
          draft,
        );
        if (mailto && (await Linking.canOpenURL(mailto))) {
          await Linking.openURL(mailto);
        } else {
          await Share.share({ message: formatFollowUpShareText(draft) });
        }
      }
    } catch {
      setError("承認を記録できませんでした。");
    } finally {
      setWorking(false);
    }
  };

  const dismiss = async () => {
    setWorking(true);
    setError(null);
    try {
      adopt(
        (
          await client.decideFollowUp(accessToken, scanId, {
            status: "dismissed",
          })
        ).recommendation,
      );
    } catch {
      setError("記録できませんでした。");
    } finally {
      setWorking(false);
    }
  };

  if (!loaded) {
    return (
      <Card>
        <ActivityIndicator color={colors.accent} />
      </Card>
    );
  }

  if (!recommendation) {
    return (
      <Card>
        <Text style={s.heading}>フォローアップ</Text>
        <Text style={s.meta}>
          {`${personName || "この人"}さんに連絡すべきか、会話メモや分析をもとにAIが判定し、送る場合は下書きまで用意します。送信はあなたが行います。`}
        </Text>
        <ErrorNotice message={error} />
        <PrimaryButton
          label="AIに判定してもらう"
          loading={working}
          onPress={() => void judge()}
        />
      </Card>
    );
  }

  const pending = recommendation.status === "suggested";
  const hasDraft = recommendation.decision === "follow_up";

  return (
    <Card>
      <View style={s.headerRow}>
        <Text style={s.heading}>フォローアップ</Text>
        <View
          style={[
            s.badge,
            recommendation.decision === "follow_up" ? s.badgeGo : s.badgeHold,
          ]}
        >
          <Text style={s.badgeText}>
            {followUpDecisionLabels[recommendation.decision]}
          </Text>
        </View>
      </View>
      <Text style={s.meta}>
        {`確信度 ${Math.round(recommendation.confidence * 100)}%`}
        {recommendation.timing ? ` ・ 目安: ${recommendation.timing}` : ""}
      </Text>

      <View style={s.reasons}>
        {recommendation.reasons.map((reason, index) => (
          <View key={`${reason.text}-${index}`} style={s.reasonRow}>
            <Text
              style={[
                s.claim,
                reason.claim_type === "fact" ? s.claimFact : s.claimHypothesis,
              ]}
            >
              {reason.claim_type === "fact" ? "事実" : "仮説"}
            </Text>
            <Text style={s.reasonText}>
              {reason.text}
              <Text style={s.meta}>{`（${sourceLabels[reason.source]}）`}</Text>
            </Text>
          </View>
        ))}
      </View>
      {recommendation.uncertainty ? (
        <Text
          style={s.meta}
        >{`不確かな点: ${recommendation.uncertainty}`}</Text>
      ) : null}

      {hasDraft && pending ? (
        recommendation.draft ? (
          <>
            <Field
              label="件名"
              value={subject}
              onChangeText={setSubject}
              maxLength={200}
              editable={!working}
            />
            <Field
              label="下書き（編集できます）"
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={4000}
              editable={!working}
            />
            <Text style={s.meta}>
              {recommendation.recipient_email
                ? "承認するとメールアプリが開きます。送信はあなたが行います。"
                : "名刺にメールアドレスがないため、承認すると共有メニューが開きます。"}
            </Text>
          </>
        ) : (
          <Text style={s.meta}>
            下書きを作れませんでした。承認だけ記録して、文面はご自身で書くこともできます。
          </Text>
        )
      ) : null}

      {pending ? (
        <>
          <ErrorNotice message={error} />
          <PrimaryButton
            label={
              hasDraft && recommendation.draft
                ? "承認して送信画面を開く"
                : "この判定で記録する"
            }
            loading={working}
            disabled={
              hasDraft &&
              recommendation.draft !== null &&
              (!subject.trim() || !body.trim())
            }
            onPress={() => void approve()}
          />
          <SecondaryButton
            label="今回は採用しない"
            disabled={working}
            onPress={() => void dismiss()}
          />
        </>
      ) : (
        <Text style={s.meta}>
          {recommendation.status === "approved"
            ? `承認済み${recommendation.edited ? "（下書きを編集）" : ""}。送ったら「記録済みのNext Action」で完了にしてください。`
            : "この判定は採用しませんでした。"}
        </Text>
      )}
      <TextButton
        label="判定し直す"
        disabled={working}
        onPress={() => void judge()}
      />
    </Card>
  );
}

const s = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeGo: { backgroundColor: colors.successSoft },
  badgeHold: { backgroundColor: colors.warningSoft },
  badgeText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  claim: {
    borderRadius: 6,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  claimFact: { backgroundColor: colors.successSoft, color: colors.success },
  claimHypothesis: {
    backgroundColor: colors.warningSoft,
    color: colors.warning,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24,
  },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  reasonRow: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  reasonText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 22 },
  reasons: { gap: 8, marginVertical: 4 },
});
