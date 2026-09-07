import type {
  MeetingGoal,
  PersonalContextResponse,
  PersonalContextType,
} from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { meetingGoalLabels, meetingGoalOptions } from "../lib/scan-capture";
import { Card, Chips, PrimaryButton, ScreenFrame, TextButton } from "./ui";

export function AnalysisPreparationScreen({
  context,
  meetingGoal,
  onMeetingGoalChange,
  onEdit,
  onBack,
  onContinue,
  captured = false,
}: {
  context: PersonalContextResponse;
  meetingGoal: MeetingGoal;
  onMeetingGoalChange: (goal: MeetingGoal) => void;
  onEdit: () => void;
  onBack: () => void;
  onContinue: () => void;
  captured?: boolean;
}) {
  const groups: { label: string; types: PersonalContextType[] }[] = [
    { label: "スキル", types: ["strong_skill", "expertise"] },
    { label: "興味・関心", types: ["current_theme"] },
    { label: "あなたの提供できる価値", types: ["offer"] },
    { label: "あなたが得たいもの", types: ["seeking"] },
  ];
  return (
    <ScreenFrame
      title="分析の準備"
      onBack={onBack}
      footer={
        <PrimaryButton
          label={captured ? "分析する" : "名刺を撮影する"}
          onPress={onContinue}
        />
      }
    >
      <Card>
        <View style={styles.heading}>
          <Text style={styles.label}>あなたについて</Text>
          <TextButton label="編集" onPress={onEdit} />
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>所属</Text>
          <Text style={styles.body}>
            {context.profile.current_company || "未設定"}
          </Text>
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>役職</Text>
          <Text style={styles.body}>
            {context.profile.current_role || "未設定"}
          </Text>
        </View>
        {groups.map((group) => {
          const values = context.items
            .filter(
              (item) => item.user_approved && group.types.includes(item.type),
            )
            .map((item) => item.text);
          return (
            <View style={styles.group} key={group.label}>
              <Text style={styles.label}>{group.label}</Text>
              {values.length ? (
                <Chips items={values} />
              ) : (
                <Text style={styles.muted}>未設定</Text>
              )}
            </View>
          );
        })}
      </Card>
      <Card>
        <Text style={styles.label}>状況（Situation）・目的</Text>
        {captured ? (
          <Text style={styles.body}>{meetingGoalLabels[meetingGoal]}</Text>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.options}>
            {meetingGoalOptions.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => onMeetingGoalChange(option.value)}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: option.value === meetingGoal,
                }}
                style={({ pressed }) => [
                  styles.option,
                  option.value === meetingGoal && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    option.value === meetingGoal && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>
    </ScreenFrame>
  );
}
const styles = StyleSheet.create({
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { color: colors.text, fontSize: 14, fontWeight: "700" },
  body: { color: colors.text, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14 },
  group: { gap: 7 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    minHeight: 44,
    justifyContent: "center",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 15,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.accentStrong,
  },
  optionPressed: { opacity: 0.8 },
  optionText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  optionTextSelected: { color: "#FFFFFF" },
});
