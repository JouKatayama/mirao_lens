// Building blocks for the 2026-09 redesign.
//
// Kept separate from ui.tsx so the existing screens keep rendering while they
// migrate one at a time. Everything here reads from @miraio/ui-tokens; no
// screen should hard-code a colour.
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from "@miraio/ui-tokens";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

// ─── Navigation bar ──────────────────────────────────────────────────────────

export function NavBar({
  action,
  onAction,
  onBack,
  title,
}: {
  action?: string;
  onAction?: () => void;
  onBack?: () => void;
  title: string;
}) {
  return (
    <View style={styles.navBar}>
      <View style={styles.navSide}>
        {onBack ? (
          <Pressable
            accessibilityLabel="戻る"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onBack}
          >
            <Text style={styles.navChevron}>‹</Text>
          </Pressable>
        ) : null}
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={styles.navTitle}
      >
        {title}
      </Text>
      <View style={[styles.navSide, styles.navSideEnd]}>
        {action ? (
          <Pressable accessibilityRole="button" hitSlop={12} onPress={onAction}>
            <Text style={styles.navAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ─── Containers ──────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: object;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

// ─── Chips ───────────────────────────────────────────────────────────────────

export function Chip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <View style={[styles.chip, tone === "accent" && styles.chipAccent]}>
      <Text
        style={[styles.chipText, tone === "accent" && styles.chipTextAccent]}
      >
        {label}
      </Text>
    </View>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function Badge({
  label,
  tone = "warning",
}: {
  label: string;
  tone?: "warning" | "success" | "danger" | "accent";
}) {
  const fill = {
    accent: colors.accentSoft,
    danger: colors.dangerSoft,
    success: colors.successSoft,
    warning: colors.warningSoft,
  }[tone];
  const ink = {
    accent: colors.accentSoftText,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: fill }]}>
      <Text style={[styles.badgeText, { color: ink }]}>{label}</Text>
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function PrimaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.primaryButtonPressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
      <Text style={styles.textButton}>{label}</Text>
    </Pressable>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export function SegmentedTabs<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  return (
    <View style={styles.tabs}>
      {options.map((option) => {
        const active = option === value;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={option}
            onPress={() => onChange(option)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FilterTabs<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  return (
    <View style={styles.filterRow}>
      {options.map((option) => {
        const active = option === value;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={option}
            onPress={() => onChange(option)}
            style={[styles.filter, active && styles.filterActive]}
          >
            <Text
              style={[styles.filterText, active && styles.filterTextActive]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export function SearchField(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Text style={styles.searchIcon}>⌕</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        {...props}
      />
    </View>
  );
}

export function NoteArea(props: TextInputProps) {
  return (
    <TextInput
      multiline
      placeholderTextColor={colors.muted}
      style={styles.noteArea}
      textAlignVertical="top"
      {...props}
    />
  );
}

export function CheckRow({
  checked,
  label,
  onToggle,
  tone = "check",
}: {
  checked: boolean;
  label: string;
  onToggle?: () => void;
  tone?: "check" | "box";
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.checkMark,
          tone === "box" && styles.checkBox,
          checked && styles.checkMarkOn,
        ]}
      >
        {checked ? <Text style={styles.checkGlyph}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── Score ring ──────────────────────────────────────────────────────────────

// A ring without a charting dependency: a track circle with a rotated arc
// clipped to one half, which is enough for the single value the design shows.
export function ScoreRing({
  size = 72,
  value,
}: {
  size?: number;
  value: number;
}) {
  const thickness = Math.max(4, Math.round(size * 0.11));
  const clamped = Math.min(100, Math.max(0, value));
  const half = size / 2;

  return (
    <View
      accessibilityLabel={`相性スコア ${clamped}パーセント`}
      accessibilityRole="image"
      style={{ height: size, width: size }}
    >
      <View
        style={[
          styles.ringTrack,
          { borderRadius: half, borderWidth: thickness },
        ]}
      />
      <View
        style={[
          styles.ringFill,
          {
            borderRadius: half,
            borderWidth: thickness,
            transform: [{ rotate: `${(clamped / 100) * 360 - 135}deg` }],
          },
        ]}
      />
      <View style={styles.ringCentre}>
        <Text style={[styles.ringValue, { fontSize: Math.round(size * 0.26) }]}>
          {clamped}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: { ...typography.micro },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.md,
    ...elevation.card,
  },
  checkBox: { borderRadius: radius.sm },
  checkGlyph: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  checkLabel: { ...typography.body, color: colors.text, flex: 1 },
  checkMark: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkMarkOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
  },
  chip: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipAccent: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chipText: { ...typography.caption, color: colors.text },
  chipTextAccent: { color: colors.accentSoftText, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  fieldLabel: { ...typography.caption, color: colors.muted },
  filter: {
    borderRadius: radius.pill,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  filterActive: { backgroundColor: colors.accentSoft },
  filterRow: { flexDirection: "row", gap: spacing.xs },
  filterText: { ...typography.captionStrong, color: colors.muted },
  filterTextActive: { color: colors.accentSoftText },
  navAction: { ...typography.captionStrong, color: colors.accent },
  navBar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    flexDirection: "row",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  navChevron: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "300",
    lineHeight: 32,
  },
  navSide: { minWidth: 56 },
  navSideEnd: { alignItems: "flex-end" },
  navTitle: {
    ...typography.heading,
    color: colors.text,
    flex: 1,
    textAlign: "center",
  },
  noteArea: {
    ...typography.body,
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    minHeight: 120,
    padding: spacing.md,
  },
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
  ringCentre: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  ringFill: {
    borderBottomColor: "transparent",
    borderLeftColor: colors.accent,
    borderRightColor: "transparent",
    borderTopColor: colors.accent,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  ringTrack: {
    borderColor: colors.track,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  ringValue: { color: colors.accent, fontWeight: "800" },
  search: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  searchIcon: { color: colors.muted, fontSize: 18 },
  searchInput: { ...typography.body, color: colors.text, flex: 1 },
  sectionTitle: { ...typography.heading, color: colors.text },
  tab: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { ...typography.captionStrong, color: colors.muted },
  tabTextActive: { color: colors.accent },
  tabs: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
  },
  textButton: { ...typography.bodyStrong, color: colors.accent },
});
