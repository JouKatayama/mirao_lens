import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";

const retentionMs = 30 * 24 * 60 * 60 * 1000;
const prefix = "miraio:audio-memo:";

type AudioMemo = { uri: string; savedAt: number };

function key(userId: string, scanId: string): string {
  return `${prefix}${userId}:${scanId}`;
}

export async function loadAudioMemo(
  userId: string,
  scanId: string,
): Promise<AudioMemo | null> {
  const raw = await AsyncStorage.getItem(key(userId, scanId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AudioMemo;
    if (typeof parsed.uri !== "string" || typeof parsed.savedAt !== "number")
      throw new Error("invalid");
    if (
      Date.now() - parsed.savedAt > retentionMs ||
      !new File(parsed.uri).exists
    ) {
      await deleteAudioMemo(userId, scanId);
      return null;
    }
    return parsed;
  } catch {
    await AsyncStorage.removeItem(key(userId, scanId));
    return null;
  }
}

export async function saveAudioMemo(
  userId: string,
  scanId: string,
  sourceUri: string,
): Promise<AudioMemo> {
  const previous = await loadAudioMemo(userId, scanId);
  const destination = new File(
    Paths.document,
    `miraio-memo-${userId}-${scanId}-${Date.now()}.m4a`,
  );
  try {
    await new File(sourceUri).move(destination);
    const memo = { uri: destination.uri, savedAt: Date.now() };
    await AsyncStorage.setItem(key(userId, scanId), JSON.stringify(memo));
    if (previous) {
      const old = new File(previous.uri);
      if (old.exists) old.delete();
    }
    return memo;
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
}

export async function deleteAudioMemo(
  userId: string,
  scanId: string,
): Promise<void> {
  const raw = await AsyncStorage.getItem(key(userId, scanId));
  if (raw) {
    try {
      const uri = (JSON.parse(raw) as { uri?: unknown }).uri;
      if (typeof uri === "string") {
        const file = new File(uri);
        if (file.exists) file.delete();
      }
    } catch {
      // Invalid local metadata is removed below.
    }
  }
  await AsyncStorage.removeItem(key(userId, scanId));
}

export async function pruneExpiredAudioMemos(now = Date.now()): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((item) =>
    item.startsWith(prefix),
  );
  for (const item of keys) {
    const raw = await AsyncStorage.getItem(item);
    if (!raw) continue;
    let expired = true;
    try {
      const savedAt = (JSON.parse(raw) as { savedAt?: unknown }).savedAt;
      expired = typeof savedAt !== "number" || now - savedAt > retentionMs;
    } catch {
      // Invalid metadata is removed.
    }
    if (expired) {
      const parts = item.slice(prefix.length).split(":");
      if (parts.length === 2) await deleteAudioMemo(parts[0]!, parts[1]!);
      else await AsyncStorage.removeItem(item);
    }
  }
}

export async function deleteUserAudioMemos(userId: string): Promise<void> {
  const userPrefix = `${prefix}${userId}:`;
  const keys = (await AsyncStorage.getAllKeys()).filter((item) =>
    item.startsWith(userPrefix),
  );
  for (const item of keys) {
    await deleteAudioMemo(userId, item.slice(userPrefix.length));
  }
}
