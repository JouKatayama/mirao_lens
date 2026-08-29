import { colors, spacing } from "@miraio/ui-tokens";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

export function ScreenFrame({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.brand}>MIRAIO LENS</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </ScrollView>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline ? styles.multiline : null]}
        {...props}
      />
    </View>
  );
}

export function PrimaryButton({
  disabled = false,
  label,
  loading = false,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed ? styles.pressed : null,
        disabled || loading ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  danger = false,
  disabled = false,
  label,
  onPress,
}: {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text
        style={danger ? styles.dangerButtonText : styles.secondaryButtonText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function ErrorNotice({ message }: { message?: string | null }) {
  return message ? (
    <View accessibilityRole="alert" style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  ) : null;
}

export function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.loadingText}>読み込み中...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D7E0DB",
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  dangerButtonText: {
    color: "#B42318",
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: { opacity: 0.5 },
  errorBox: {
    backgroundColor: "#FEE4E2",
    borderRadius: 12,
    padding: spacing.md,
  },
  errorText: { color: "#912018", fontSize: 14, lineHeight: 20 },
  fieldGroup: { gap: spacing.sm },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#B8C7BF",
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: { color: colors.text, fontSize: 14, fontWeight: "700" },
  loadingScreen: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
  },
  loadingText: { color: colors.muted, fontSize: 15 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  pressed: { opacity: 0.75 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  screen: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: 48,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#B8C7BF",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 38,
  },
});
