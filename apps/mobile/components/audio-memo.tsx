import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";

import {
  deleteAudioMemo,
  loadAudioMemo,
  saveAudioMemo,
} from "../lib/audio-memo";
import { SecondaryButton } from "./ui";

export function AudioMemo({
  userId,
  scanId,
}: {
  userId: string;
  scanId: string;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(null);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef(false);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && recordingRef.current) void stopRef.current();
    });
    return () => {
      subscription.remove();
      if (recordingRef.current) void stopRef.current();
    };
  }, []);

  useEffect(() => {
    let live = true;
    void loadAudioMemo(userId, scanId)
      .then((memo) => {
        if (live) setUri(memo?.uri ?? null);
      })
      .catch(() => {
        if (live) setError("音声メモを読み込めませんでした。");
      });
    return () => {
      live = false;
    };
  }, [userId, scanId]);

  async function start() {
    if (!consent || recording) return;
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("マイクの使用を許可してください。");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      if (AppState.currentState !== "active")
        throw new Error("app_in_background");
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
    } catch {
      await setAudioModeAsync({ allowsRecording: false }).catch(
        () => undefined,
      );
      setError("録音を開始できませんでした。");
    }
  }

  async function stop() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    try {
      await recorder.stop();
      if (!recorder.uri) throw new Error("missing audio");
      const memo = await saveAudioMemo(userId, scanId, recorder.uri);
      setUri(memo.uri);
      setConsent(false);
    } catch {
      setError("音声メモを保存できませんでした。");
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(
        () => undefined,
      );
      setRecording(false);
    }
  }
  stopRef.current = stop;

  if (Platform.OS === "web") return null;

  return (
    <View>
      <Text>音声メモ（この端末のみ・30日後に削除）</Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent(!consent)}
      >
        <Text>{consent ? "☑" : "☐"} 会話相手の録音同意を得ました</Text>
      </Pressable>
      {recording ? (
        <SecondaryButton
          label="● 録音中 — 停止して保存"
          onPress={() => void stop()}
        />
      ) : (
        <SecondaryButton label="録音を開始" onPress={() => void start()} />
      )}
      {uri ? (
        <>
          <SecondaryButton
            label="音声を再生"
            onPress={() => {
              player.replace(uri);
              player.play();
            }}
          />
          <SecondaryButton
            label="音声を削除"
            onPress={() =>
              void deleteAudioMemo(userId, scanId).then(() => setUri(null))
            }
          />
        </>
      ) : null}
      {error ? <Text>{error}</Text> : null}
    </View>
  );
}
