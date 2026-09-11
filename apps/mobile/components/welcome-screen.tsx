import { colors } from "@miraio/ui-tokens";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LensMark } from "./icons";
import { PrimaryButton } from "./ui";

const valuePoints = [
  "名刺を撮るだけで、相手とあなたの「接点」がわかる",
  "会話の最初に聞くとよい質問を、その場で提案",
  "会話メモと次の一手まで、ひとつの流れで記録",
] as const;

export function WelcomeScreen({
  onStart,
  onLogin,
}: {
  onStart: () => void;
  onLogin: () => void;
}) {
  return (
    <LinearGradient
      colors={["#10101E", "#151324", "#312143"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.fill, styles.background]}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.fill}>
        <View style={styles.content}>
          <View style={styles.identity}>
            <LensMark />
            <Text accessibilityRole="header" style={styles.name}>
              Miraio Lens
            </Text>
            <Text style={styles.tagline}>
              人との出会いを、未来の価値に変える。
            </Text>
            {/* The tagline alone never said what the app does. A first-time
                user decides here whether it is worth an email address. */}
            <View style={styles.points}>
              {valuePoints.map((point) => (
                <View key={point} style={styles.point}>
                  <View style={styles.pointDot} />
                  <Text style={styles.pointText}>{point}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.start}>
              <PrimaryButton label="はじめる" onPress={onStart} />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onLogin}
              style={({ pressed }) => [
                styles.login,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Text style={styles.loginText}>ログインする</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  background: { backgroundColor: colors.dark },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    paddingHorizontal: 30,
  },
  identity: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 54,
    gap: 20,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "600",
    letterSpacing: -0.8,
  },
  tagline: {
    color: "#F4F0F9",
    fontSize: 14,
    lineHeight: 24,
    textAlign: "center",
  },
  points: { alignSelf: "stretch", gap: 12, paddingTop: 12 },
  point: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  pointDot: {
    backgroundColor: "#D2AAFF",
    borderRadius: 4,
    height: 8,
    marginTop: 8,
    width: 8,
  },
  pointText: { color: "#F4F0F9", flex: 1, fontSize: 15, lineHeight: 24 },
  actions: { paddingBottom: 55, gap: 20, paddingTop: 40 },
  start: { borderRadius: 26, overflow: "hidden" },
  login: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  loginText: { color: "#D2AAFF", fontSize: 14, fontWeight: "600" },
});
