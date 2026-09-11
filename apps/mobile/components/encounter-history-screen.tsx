import type { EncounterHistoryItem } from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { meetingGoalLabels } from "../lib/scan-capture";
import { Icon } from "./icons";
import { Card, ErrorNotice, ScreenFrame, SecondaryButton } from "./ui";

function formatEncounterDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "日付不明"
    : parsed.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
}

export function EncounterHistoryScreen({
  card,
  error,
  items,
  onBack,
  onOpenEncounter,
}: {
  card: { name: string | null; company: string | null };
  error: string | null;
  items: EncounterHistoryItem[];
  onBack: () => void;
  onOpenEncounter: (scanId: string) => void;
}) {
  return (
    <ScreenFrame
      title="これまでの接点"
      subtitle={`${card.name || "この人"}さんと過去に交換した名刺の記録です。`}
      onBack={onBack}
    >
      {items.length === 0 ? (
        <Card>
          <Text style={s.body}>過去の接点は記録されていません。</Text>
        </Card>
      ) : (
        items.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${formatEncounterDate(item.created_at)}の記録を開く`}
            key={item.scan_id}
            onPress={() => onOpenEncounter(item.scan_id)}
            style={({ pressed }) => [s.row, pressed && s.pressed]}
          >
            <View style={s.icon}>
              <Icon name="note" color={colors.accentStrong} size={20} />
            </View>
            <View style={s.flex}>
              <Text style={s.date}>{formatEncounterDate(item.created_at)}</Text>
              <Text style={s.meta}>{meetingGoalLabels[item.meeting_goal]}</Text>
              {item.note_excerpt ? (
                <Text style={s.note}>{item.note_excerpt}</Text>
              ) : (
                <Text style={s.meta}>会話メモはありません。</Text>
              )}
            </View>
          </Pressable>
        ))
      )}

      <ErrorNotice message={error} />
      <SecondaryButton label="Flash Briefに戻る" onPress={onBack} />
    </ScreenFrame>
  );
}

const s = StyleSheet.create({
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  date: { color: colors.text, fontSize: 15, fontWeight: "700" },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  note: { color: colors.text, fontSize: 14, lineHeight: 22, marginTop: 2 },
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
