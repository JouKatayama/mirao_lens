import type { ScanHistoryItem } from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Icon } from "./icons";
import {
  Avatar,
  BottomNav,
  Card,
  ErrorNotice,
  IconButton,
  ScreenFrame,
  SecondaryButton,
  TabBar,
  TextButton,
} from "./ui";

const tabs = [
  { value: "all", label: "すべて" },
  { value: "ready", label: "分析済み" },
  { value: "processing", label: "分析中" },
  { value: "failed", label: "エラー" },
] as const;
const statusLabels = {
  processing: "読み取り中",
  brief_ready: "Brief完成",
  deep_enrichment: "分析中",
  deep_ready: "分析完了",
  failed: "再試行が必要",
} as const;

export function HomeScreen({
  items,
  error,
  onRefresh,
  onOpenScan,
  onDeleteScan,
  onCapture,
  onProfile,
  analysisOnly = false,
}: {
  items: ScanHistoryItem[] | null;
  error: string | null;
  onRefresh: () => void;
  onOpenScan: (id: string) => void;
  onDeleteScan: (id: string) => Promise<void>;
  onCapture: () => void;
  onProfile: () => void;
  analysisOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof tabs)[number]["value"]>(
    analysisOnly ? "ready" : "all",
  );
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const visible = items?.filter((item) => {
    const searchMatch = [item.card_name, item.card_company, item.card_title]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
    const statusMatch =
      filter === "all" ||
      (filter === "ready" &&
        ["deep_ready", "brief_ready"].includes(item.status)) ||
      (filter === "processing" &&
        ["processing", "deep_enrichment"].includes(item.status)) ||
      (filter === "failed" && item.status === "failed");
    return searchMatch && statusMatch;
  });
  return (
    <View style={s.fill}>
      <ScreenFrame title="ホーム">
        <View style={s.search}>
          <Icon name="search" size={20} />
          <TextInput
            accessibilityLabel="人物を検索"
            placeholder="人物を検索"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={s.searchInput}
          />
        </View>
        <TabBar items={tabs} selected={filter} onSelect={setFilter} />
        {items === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : visible?.length ? (
          visible.map((item) => (
            <View key={item.scan_id} style={s.contact}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.card_name || "名前未登録"}の人物サマリー`}
                onPress={() => onOpenScan(item.scan_id)}
                style={({ pressed }) => [
                  s.contactMain,
                  pressed && { opacity: 0.65 },
                ]}
              >
                <Avatar name={item.card_name} />
                <View style={s.details}>
                  <Text style={s.name}>{item.card_name || "名前未登録"}</Text>
                  {item.card_company ? (
                    <Text style={s.meta}>{item.card_company}</Text>
                  ) : null}
                  {item.card_title ? (
                    <Text style={s.meta}>{item.card_title}</Text>
                  ) : null}
                  <View style={[s.badge, item.status === "failed" && s.failed]}>
                    <Text style={s.badgeText}>{statusLabels[item.status]}</Text>
                  </View>
                </View>
                <View style={s.trailing}>
                  <View style={s.statusIcon}>
                    <Icon
                      name={
                        item.status === "deep_ready"
                          ? "checked"
                          : item.status === "failed"
                            ? "close"
                            : "note"
                      }
                      color={colors.accentStrong}
                      size={23}
                    />
                  </View>
                  <Text style={s.date}>
                    {new Date(item.created_at).toLocaleDateString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              </Pressable>
              <IconButton
                label={`${item.card_name || "スキャン"}を削除`}
                name="trash"
                onPress={() => setPendingDelete(item.scan_id)}
              />
              {pendingDelete === item.scan_id ? (
                <View style={s.confirm}>
                  <Text style={s.meta}>
                    このスキャンと関連データを削除しますか？
                  </Text>
                  <View style={s.confirmButtons}>
                    <TextButton
                      label="キャンセル"
                      disabled={deleting}
                      onPress={() => setPendingDelete(null)}
                    />
                    <TextButton
                      label={deleting ? "削除中…" : "削除する"}
                      disabled={deleting}
                      onPress={() => {
                        setDeleting(true);
                        setLocalError(null);
                        void onDeleteScan(item.scan_id)
                          .then(() => setPendingDelete(null))
                          .catch(() =>
                            setLocalError(
                              "削除できませんでした。再試行してください。",
                            ),
                          )
                          .finally(() => setDeleting(false));
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <Card>
            <Text style={s.emptyTitle}>
              {items.length
                ? "一致する人物がいません"
                : "新しい出会いを、ここから。"}
            </Text>
            <Text style={s.emptyText}>
              {items.length
                ? "検索条件を変えてお試しください。"
                : "名刺を撮影すると、人物の情報とあなたとの接点がここにまとまります。"}
            </Text>
            <SecondaryButton label="名刺を撮影する" onPress={onCapture} />
          </Card>
        )}
        <ErrorNotice message={localError || error} />
        {error ? (
          <SecondaryButton label="再読み込み" onPress={onRefresh} />
        ) : null}
      </ScreenFrame>
      <View style={s.nav}>
        <BottomNav
          selected={filter === "ready" ? "analysis" : "home"}
          onHome={() => {
            setFilter("all");
            onRefresh();
          }}
          onCapture={onCapture}
          onAnalysis={() => setFilter("ready")}
          onProfile={onProfile}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  nav: { maxWidth: 600, width: "100%", alignSelf: "center" },
  search: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#F2F1F7",
    borderRadius: 12,
    paddingHorizontal: 13,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 12,
  },
  contact: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    padding: 10,
    boxShadow: "0 2px 12px rgba(70,35,110,0.025)",
  },
  contactMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 105,
  },
  details: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.text, fontSize: 12, lineHeight: 19 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
  },
  failed: { backgroundColor: "#FFF0E7" },
  badgeText: { color: "#644099", fontSize: 10 },
  trailing: { gap: 10, alignItems: "center" },
  statusIcon: {
    width: 45,
    height: 45,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  date: { color: colors.muted, fontSize: 10 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 23 },
  confirm: {
    width: "100%",
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  confirmButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 20 },
});
