// Shared primitives for the app screens.
//
// The component API predates the 2026-09 redesign and is unchanged; only the
// styling moved, so every screen composed from these picks up the new look
// without being touched. Colours and metrics come from @miraio/ui-tokens.
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from "@miraio/ui-tokens";
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
      style={styles.screenBackground}
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
        pressed ? styles.primaryButtonPressed : null,
        disabled || loading ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onAccent} />
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
    ...typography.micro,
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  // Cards now read as raised surfaces rather than outlined boxes.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.md,
    ...elevation.card,
  },
  dangerButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: { opacity: 0.45 },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { ...typography.body, color: colors.danger },
  fieldGroup: { gap: spacing.sm },
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: { ...typography.captionStrong, color: colors.text },
  loadingScreen: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
  },
  loadingText: { ...typography.body, color: colors.muted },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  pressed: { opacity: 0.75 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  primaryButtonPressed: { backgroundColor: colors.accentPressed },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
  screen: {
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: 48,
    paddingTop: spacing.lg,
  },
  screenBackground: { backgroundColor: colors.background },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  subtitle: { ...typography.body, color: colors.muted },
  title: { ...typography.display, color: colors.text },
});
