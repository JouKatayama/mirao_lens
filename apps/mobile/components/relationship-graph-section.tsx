import type {
  ConnectionDirection,
  ConnectionType,
  GraphConnection,
  GraphPerson,
  RelationshipGraphResponse,
} from "@miraio/domain";
import { connectionTypes } from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { connectionTypeLabels } from "../lib/follow-up-handoff";
import {
  RelationshipApiError,
  type RelationshipApiClient,
} from "../lib/relationship-api";
import { Card, ErrorNotice, PrimaryButton, TextButton } from "./ui";

function describeConnection(connection: GraphConnection, self: string): string {
  const other = connection.person.name;
  if (connection.connection_type !== "introduced_by") {
    return `${other}さんと${connectionTypeLabels[connection.connection_type]}`;
  }
  return connection.direction === "outgoing"
    ? `${other}さんの紹介で知り合った`
    : `${self}さんが${other}さんを紹介した`;
}

function personLine(person: GraphPerson): string {
  return [person.name, person.company, person.title]
    .filter(Boolean)
    .join(" ・ ");
}

/**
 * "How you know them" (spec §2.4, extension 6): the private graph around the
 * person on this scan. Read-only context plus connections the user records
 * by hand. There is deliberately no graph drawing.
 */
export function RelationshipGraphSection({
  accessToken,
  client,
  scanId,
}: {
  accessToken: string;
  client: RelationshipApiClient;
  scanId: string;
}) {
  const [graph, setGraph] = useState<RelationshipGraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [type, setType] = useState<ConnectionType>("knows");
  const [direction, setDirection] = useState<ConnectionDirection>("outgoing");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setGraph(await client.getGraph(accessToken, scanId));
      setError(null);
    } catch {
      setError("つながりを読み込めませんでした。");
    }
  }, [accessToken, client, scanId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!graph) {
    return (
      <Card>
        <Text style={s.heading}>つながり</Text>
        {error ? (
          <ErrorNotice message={error} />
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </Card>
    );
  }

  if (!graph.person) {
    return (
      <Card>
        <Text style={s.heading}>つながり</Text>
        <Text style={s.meta}>
          この名刺はまだ人物として特定されていないため、つながりを記録できません。
        </Text>
      </Card>
    );
  }

  const self = graph.person.name;

  const save = async () => {
    if (!otherId) return;
    setSaving(true);
    setError(null);
    try {
      await client.addConnection(accessToken, scanId, {
        connection_type: type,
        direction,
        other_person_id: otherId,
      });
      setAdding(false);
      setOtherId(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof RelationshipApiError && caught.status === 409
          ? "このつながりはすでに記録されています。"
          : "つながりを保存できませんでした。",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (connectionId: string) => {
    setError(null);
    try {
      await client.deleteConnection(accessToken, scanId, connectionId);
      await load();
    } catch {
      setError("つながりを削除できませんでした。");
    }
  };

  return (
    <Card>
      <Text style={s.heading}>つながり</Text>

      {graph.events.length > 0 ? (
        <Text style={s.body}>
          {`会った場: ${graph.events.map((event) => event.name).join("、")}`}
        </Text>
      ) : null}

      {graph.connections.length > 0 ? (
        <View style={s.group}>
          {graph.connections.map((connection) => (
            <View key={connection.id} style={s.row}>
              <Text style={s.rowText}>
                {describeConnection(connection, self)}
              </Text>
              <TextButton
                label="削除"
                onPress={() => void remove(connection.id)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.meta}>記録されたつながりはまだありません。</Text>
      )}

      {graph.second_hop.length > 0 ? (
        <View style={s.group}>
          <Text style={s.subheading}>つながりの先</Text>
          {graph.second_hop.map((hop) => (
            <Text key={`${hop.via.id}-${hop.person.id}`} style={s.body}>
              {`${hop.person.name}さん（${hop.via.name}さん経由・${connectionTypeLabels[hop.connection_type]}）`}
            </Text>
          ))}
        </View>
      ) : null}

      {graph.colleagues.length > 0 ? (
        <View style={s.group}>
          <Text style={s.subheading}>同じ会社で会った人</Text>
          {graph.colleagues.map((person) => (
            <Text key={person.id} style={s.body}>
              {personLine(person)}
            </Text>
          ))}
        </View>
      ) : null}

      <ErrorNotice message={error} />

      {adding ? (
        <View style={s.group}>
          <Text style={s.subheading}>相手を選ぶ（会ったことのある人）</Text>
          {graph.candidates.length === 0 ? (
            <Text style={s.meta}>まだ他の人の名刺がありません。</Text>
          ) : (
            <View style={s.chips}>
              {graph.candidates.map((person) => (
                <Choice
                  key={person.id}
                  label={person.name}
                  selected={otherId === person.id}
                  onPress={() => setOtherId(person.id)}
                />
              ))}
            </View>
          )}
          <Text style={s.subheading}>関係</Text>
          <View style={s.chips}>
            {connectionTypes.map((value) => (
              <Choice
                key={value}
                label={connectionTypeLabels[value]}
                selected={type === value}
                onPress={() => setType(value)}
              />
            ))}
          </View>
          {type === "introduced_by" ? (
            <View style={s.chips}>
              <Choice
                label={`${self}さんを紹介してもらった`}
                selected={direction === "outgoing"}
                onPress={() => setDirection("outgoing")}
              />
              <Choice
                label={`${self}さんが紹介してくれた`}
                selected={direction === "incoming"}
                onPress={() => setDirection("incoming")}
              />
            </View>
          ) : null}
          <PrimaryButton
            label="つながりを保存"
            loading={saving}
            disabled={!otherId}
            onPress={() => void save()}
          />
          <TextButton label="やめる" onPress={() => setAdding(false)} />
        </View>
      ) : (
        <TextButton label="＋ つながりを追加" onPress={() => setAdding(true)} />
      )}
    </Card>
  );
}

function Choice({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && s.chipSelected]}
    >
      <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { color: colors.text, fontSize: 14, lineHeight: 22 },
  chip: {
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextSelected: { color: colors.accentStrong, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  group: { gap: 6, marginTop: 4 },
  heading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24,
  },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  rowText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 22 },
  subheading: { color: colors.muted, fontSize: 13, fontWeight: "800" },
});
