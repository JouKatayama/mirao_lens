import { colors } from "@miraio/ui-tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  formatReminderDueAt,
  reminderChoices,
  toReminderDueDate,
  type ReminderChoice,
} from "../lib/reminder-schedule";
import { remindersSupported } from "../lib/reminders";
import { TextButton } from "./ui";

/**
 * The reminder on an action the user already saved.
 *
 * The choice used to be available only in the seconds the action was written,
 * which is the moment the user knows least about when they will get to it. A
 * reminder they now want, or now want moved, is a change to an action that
 * already exists rather than a reason to write a second one.
 */
export function NextActionReminder({
  disabled = false,
  dueAt,
  onChange,
}: {
  disabled?: boolean;
  /** The stored due moment, or null when this action has no reminder. */
  dueAt: string | null;
  /** Resolves to whether a notification was actually scheduled. */
  onChange: (dueAt: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const due = dueAt ? new Date(dueAt) : null;
  const scheduled = due && !Number.isNaN(due.getTime()) ? due : null;

  async function choose(choice: ReminderChoice) {
    if (saving) return;

    setSaving(true);
    setNotice(null);

    try {
      const next = toReminderDueDate(choice, new Date());
      const delivered = await onChange(next ? next.toISOString() : null);

      setEditing(false);
      setNotice(
        next && remindersSupported && !delivered
          ? // Said here for the same reason the note screen says it: the user
            // was about to believe a notification is coming.
            "保存しましたが、この端末ではリマインド通知を設定できませんでした。通知の許可をご確認ください。"
          : null,
      );
    } catch {
      setNotice("リマインドを変更できませんでした。再試行してください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.group}>
      <View style={s.row}>
        <Text style={[s.state, s.flex]}>
          {scheduled
            ? `リマインド：${formatReminderDueAt(scheduled)}`
            : "リマインドなし"}
        </Text>
        {!editing ? (
          <TextButton
            disabled={disabled || saving}
            label={scheduled ? "変更" : "設定する"}
            onPress={() => {
              setNotice(null);
              setEditing(true);
            }}
          />
        ) : null}
      </View>
      {editing ? (
        <>
          <View accessibilityRole="radiogroup" style={s.choices}>
            {reminderChoices.map((choice) => (
              <Pressable
                accessibilityLabel={choice.label}
                accessibilityRole="radio"
                accessibilityState={{ checked: false, disabled: saving }}
                disabled={disabled || saving}
                key={choice.value}
                onPress={() => void choose(choice.value)}
                style={({ pressed }) => [s.choice, pressed && s.pressed]}
              >
                <Text style={s.choiceText}>{choice.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextButton
            disabled={saving}
            label="やめる"
            onPress={() => setEditing(false)}
          />
        </>
      ) : null}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  group: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  state: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  choiceText: { color: colors.accentStrong, fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.82 },
  notice: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
