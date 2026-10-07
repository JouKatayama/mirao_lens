import type { HubSpotExportRequest } from "@miraio/domain";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { Card, Field, SecondaryButton } from "./ui";

export function HubSpotExport({
  connected,
  scanId,
  initial,
  note,
  action,
  onExport,
}: {
  connected: boolean;
  scanId: string;
  initial: HubSpotExportRequest["contact"];
  note: string | null;
  action: string | null;
  onExport: (
    input: HubSpotExportRequest,
  ) => Promise<{ contact_id: string; note_status: string }>;
}) {
  const [contact, setContact] = useState(initial);
  const [reviewedNote, setReviewedNote] = useState(note ?? "");
  const [reviewedAction, setReviewedAction] = useState(action ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!connected) return null;

  function change(key: keyof typeof contact, value: string) {
    setContact((current) => ({ ...current, [key]: value }));
    setConfirmed(false);
  }

  async function submit() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await onExport({
        scan_id: scanId,
        contact,
        ...(reviewedNote.trim() ? { reviewed_note: reviewedNote.trim() } : {}),
        ...(reviewedAction.trim()
          ? { reviewed_action: reviewedAction.trim() }
          : {}),
      });
      setResult(
        response.note_status === "sending"
          ? "連絡先を送信しました。メモの送信結果は不明のため、重複防止のため自動再送しません。"
          : "HubSpotへ送信しました。",
      );
      setConfirmed(false);
    } catch {
      setError(
        "送信できませんでした。HubSpotの状態を確認してから再試行してください。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text>HubSpotへ送る内容を確認</Text>
      <Field
        label="メール（重複判定に使用）"
        value={contact.email}
        onChangeText={(value) => change("email", value)}
      />
      <Field
        label="名前"
        value={contact.firstname ?? ""}
        onChangeText={(value) => change("firstname", value)}
      />
      <Field
        label="姓"
        value={contact.lastname ?? ""}
        onChangeText={(value) => change("lastname", value)}
      />
      <Field
        label="会社"
        value={contact.company ?? ""}
        onChangeText={(value) => change("company", value)}
      />
      <Field
        label="役職"
        value={contact.jobtitle ?? ""}
        onChangeText={(value) => change("jobtitle", value)}
      />
      <Field
        label="電話"
        value={contact.phone ?? ""}
        onChangeText={(value) => change("phone", value)}
      />
      <Field
        label="送るメモ（空欄なら送らない）"
        multiline
        value={reviewedNote}
        onChangeText={(value) => {
          setReviewedNote(value);
          setConfirmed(false);
        }}
      />
      <Field
        label="送る次の行動（空欄なら送らない）"
        multiline
        value={reviewedAction}
        onChangeText={(value) => {
          setReviewedAction(value);
          setConfirmed(false);
        }}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        onPress={() => setConfirmed(!confirmed)}
      >
        <Text>{confirmed ? "☑" : "☐"} 上記の送信内容を確認しました</Text>
      </Pressable>
      <SecondaryButton
        label={busy ? "送信中…" : "HubSpotへ明示的に送信"}
        disabled={!confirmed || busy || !contact.email}
        onPress={() => void submit()}
      />
      {result ? <Text>{result}</Text> : null}
      {error ? <Text>{error}</Text> : null}
    </Card>
  );
}
