import { colors, spacing } from "@miraio/ui-tokens";
import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, type IconName } from "./icons";
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
  onBack,
  action,
  footer,
  tabs,
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
  onBack?: () => void;
  action?: ReactNode;
  footer?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {onBack ? (
            <IconButton label="戻る" name="back" onPress={onBack} />
          ) : null}
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <View style={[styles.headerSide, styles.headerRight]}>{action}</View>
      </View>
      {tabs}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
      >
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
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
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed ? styles.pressed : null,
        disabled || loading ? styles.disabled : null,
      ]}
    >
      <LinearGradient
        colors={["#AD72F7", "#A969F1"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.buttonFill}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>{label}</Text>
        )}
      </LinearGradient>
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

export function IconButton({
  name,
  label,
  onPress,
  color,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.textButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Avatar({
  name,
  large = false,
}: {
  name: string | null;
  large?: boolean;
}) {
  return (
    <View
      accessibilityLabel={name ? `${name}のプロフィール` : "プロフィール"}
      style={[styles.avatar, large && styles.avatarLarge]}
    >
      <Icon name="person" size={large ? 45 : 27} color="#A79BBC" />
    </View>
  );
}

export function Chips({ items }: { items: string[] }) {
  return (
    <View style={styles.chips}>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.chip}>
          <Text style={styles.chipText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function TabBar<T extends string>({
  items,
  selected,
  onSelect,
}: {
  items: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {items.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === item.value }}
          aria-selected={selected === item.value}
          onPress={() => onSelect(item.value)}
          style={[styles.tab, selected === item.value && styles.tabActive]}
        >
          <Text
            style={[
              styles.tabText,
              selected === item.value && styles.tabTextActive,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function BottomNav({
  selected,
  onHome,
  onCapture,
  onAnalysis,
  onProfile,
}: {
  selected: "home" | "camera" | "analysis" | "profile";
  onHome: () => void;
  onCapture: () => void;
  onAnalysis: () => void;
  onProfile: () => void;
}) {
  const items = [
    { value: "home", label: "ホーム", icon: "home", onPress: onHome },
    {
      value: "camera",
      label: "名刺を撮影",
      icon: "camera",
      onPress: onCapture,
    },
    { value: "analysis", label: "分析", icon: "bridge", onPress: onAnalysis },
    {
      value: "profile",
      label: "プロフィール",
      icon: "person",
      onPress: onProfile,
    },
  ] as const;
  return (
    <View style={styles.bottomNav}>
      {items.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === item.value }}
          aria-current={selected === item.value ? "page" : undefined}
          onPress={item.onPress}
          style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
        >
          <Icon
            name={item.icon}
            color={selected === item.value ? colors.accentStrong : colors.muted}
            size={22}
          />
          <Text
            style={[
              styles.navText,
              selected === item.value && styles.tabTextActive,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
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
  frame: { flex: 1, width: "100%", maxWidth: 600, alignSelf: "center" },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingHorizontal: 10,
  },
  headerSide: { width: 60 },
  headerRight: { alignItems: "flex-end" },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.background,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  textButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  textButtonText: {
    color: colors.accentStrong,
    fontSize: 14,
    fontWeight: "600",
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F0EDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLarge: { width: 98, height: 98, borderRadius: 49 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: "100%",
  },
  chipText: { color: "#4D337D", fontSize: 12, lineHeight: 18 },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    paddingHorizontal: 3,
  },
  tabActive: {
    borderBottomColor: colors.accent,
    backgroundColor: "#F9F5FF",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  tabTextActive: { color: colors.accentStrong },
  bottomNav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 58,
    gap: 5,
  },
  navText: { color: colors.muted, fontSize: 11 },
  buttonFill: {
    width: "100%",
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  brand: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: spacing.md,
    boxShadow: "0 2px 12px rgba(70, 35, 110, 0.035)",
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
    borderColor: colors.border,
    borderRadius: 9,
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
    borderRadius: 9,
    overflow: "hidden",
    justifyContent: "center",
    minHeight: 50,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  screen: {
    gap: 20,
    padding: 20,
    paddingTop: 12,
    paddingBottom: 28,
    flexGrow: 1,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
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
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
    flex: 1,
    textAlign: "center",
  },
});
