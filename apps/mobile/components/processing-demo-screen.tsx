import { colors } from "@miraio/ui-tokens";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton, ScreenFrame } from "./ui";

const steps = [
  { label: "名刺を読み取りました", state: "done" },
  { label: "会社・役職を確認", state: "done" },
  { label: "あなたとの接点を分析中", state: "active" },
  { label: "会話候補を生成中", state: "pending" },
  { label: "公開情報を追加調査中", state: "pending" },
] as const;

export function ProcessingDemoScreen({
  onBack,
  onReady,
}: {
  onBack: () => void;
  onReady: () => void;
}) {
  return (
    <ScreenFrame
      title="処理中"
      onBack={onBack}
      footer={<PrimaryButton label="Flash Briefを見る" onPress={onReady} />}
    >
      <View style={styles.personCard}>
        <View style={styles.personHeading}>
          <Text style={styles.personName}>デモ 太郎</Text>
          <Text style={styles.factChip}>FACT</Text>
        </View>
        <Text style={styles.personDetail}>株式会社サンプル / 営業部 部長</Text>
      </View>

      <View style={styles.progressCard}>
        <Text style={styles.heading}>名刺から、会話の準備へ</Text>
        <View style={styles.steps}>
          {steps.map((step) => (
            <View key={step.label} style={styles.step}>
              <View
                style={[
                  styles.marker,
                  step.state === "done" && styles.markerDone,
                  step.state === "active" && styles.markerActive,
                ]}
              >
                <Text
                  style={[
                    styles.markerText,
                    step.state === "pending" && styles.markerPendingText,
                  ]}
                >
                  {step.state === "done" ? "✓" : step.state === "active" ? "●" : "○"}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepText,
                  step.state === "active" && styles.stepActiveText,
                  step.state === "pending" && styles.stepPendingText,
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.note}>Flash Brief は数秒で表示されます</Text>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  personCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 18,
  },
  personHeading: { alignItems: "center", flexDirection: "row", gap: 10 },
  personName: { color: colors.text, fontSize: 19, fontWeight: "700" },
  factChip: {
    backgroundColor: colors.successSoft,
    borderRadius: 999,
    color: colors.success,
    fontSize: 10,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  personDetail: { color: colors.muted, fontSize: 12 },
  progressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 22,
    padding: 18,
  },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700" },
  steps: { gap: 20 },
  step: { alignItems: "center", flexDirection: "row", gap: 13, minHeight: 35 },
  marker: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  markerDone: { backgroundColor: colors.success, borderColor: colors.success },
  markerActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  markerText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
  markerPendingText: { color: colors.muted },
  stepText: { color: colors.text, flex: 1, fontSize: 14 },
  stepActiveText: { color: colors.accentStrong, fontWeight: "700" },
  stepPendingText: { color: colors.muted },
  note: { color: colors.muted, fontSize: 13, textAlign: "center" },
});
