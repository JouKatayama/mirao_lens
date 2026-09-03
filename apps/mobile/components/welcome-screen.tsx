import { colors } from "@miraio/ui-tokens";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LensMark } from "./icons";
import { PrimaryButton } from "./ui";

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
      style={styles.fill}
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
  fill: { flex: 1, backgroundColor: colors.dark },
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
  actions: { paddingBottom: 55, gap: 20, paddingTop: 100 },
  start: { borderRadius: 26, overflow: "hidden" },
  login: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  loginText: { color: "#D2AAFF", fontSize: 14, fontWeight: "600" },
});
