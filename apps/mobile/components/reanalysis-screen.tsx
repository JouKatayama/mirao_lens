import type { MeetingGoal } from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { meetingGoalOptions } from "../lib/scan-capture";
import { Icon } from "./icons";
import {
  Card,
  ErrorNotice,
  PrimaryButton,
  ScreenFrame,
  TextButton,
} from "./ui";

export function ReanalysisScreen({
  card,
  currentGoal,
  error,
  onBack,
  onReanalyze,
}: {
  card: { name: string | null };
  currentGoal: MeetingGoal;
  error: string | null;
  onBack: () => void;
  onReanalyze: (goal: MeetingGoal) => Promise<void>;
}) {
  const [goal, setGoal] = useState<MeetingGoal>(currentGoal);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      await onReanalyze(goal);
    } catch {
      setLocalError("再分析を開始できませんでした。再試行してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenFrame
      title="面談ゴールを変更"
      subtitle={`${card.name || "この人"}さんとの会話の目的が変わったときに、その前提で分析し直します。`}
      onBack={onBack}
      footer={
        <PrimaryButton
          label={busy ? "再分析を開始中…" : "この目的で分析し直す"}
          disabled={busy || goal === currentGoal}
          onPress={() => void submit()}
        />
      }
    >
      <Card>
        {meetingGoalOptions.map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: goal === option.value }}
            // react-native-web does not map accessibilityState.checked onto a
            // radio, so the web target needs it stated directly.
            aria-checked={goal === option.value}
            key={option.value}
            onPress={() => setGoal(option.value)}
            style={({ pressed }) => [s.option, pressed && s.pressed]}
          >
            <View style={[s.radio, goal === option.value && s.radioActive]}>
              {goal === option.value ? (
                <Icon name="check" size={13} color="#FFFFFF" />
              ) : null}
            </View>
            <Text style={s.optionText}>{option.label}</Text>
            {option.value === currentGoal ? (
              <Text style={s.current}>現在</Text>
            ) : null}
          </Pressable>
        ))}
      </Card>

      {/* The user is about to spend the wait again, and the text they may have
          read to the person in front of them is about to change. */}
      <Text style={s.notice}>
        Flash
        Briefと分析結果は新しい目的で作り直されます。名刺の内容と会話メモ、Next
        Actionはそのまま残ります。
      </Text>

      <ErrorNotice message={localError || error} />
      <TextButton label="変更せずに戻る" onPress={onBack} />
    </ScreenFrame>
  );
}

const s = StyleSheet.create({
  current: { color: colors.muted, fontSize: 12 },
  notice: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  optionText: { color: colors.text, flex: 1, fontSize: 15 },
  pressed: { opacity: 0.7 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.accentStrong,
  },
});
