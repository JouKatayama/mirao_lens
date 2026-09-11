import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Local notifications for next actions.
 *
 * Local, not push: a reminder to send a follow-up needs no server, no device
 * token and no third party, and the pilot has no infrastructure for any of
 * them. The cost is that reminders live on the device that set them — a
 * reinstall loses them, and they do not follow the user to another phone.
 */
const storageKeyPrefix = "miraio.reminder";

function storageKey(actionId: string): string {
  return `${storageKeyPrefix}.${actionId}`;
}

// react-native-web has no notification scheduler, and the dev preview must not
// crash on it.
const supported = Platform.OS !== "web";

export async function requestReminderPermission(): Promise<boolean> {
  if (!supported) return false;

  try {
    const current = await Notifications.getPermissionsAsync();

    if (current.granted) return true;
    if (!current.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Returns whether the reminder was actually scheduled. A refused permission is
 * not an error: the action is still saved, and the caller says so rather than
 * promising a notification that will never arrive.
 */
export async function scheduleReminder(
  actionId: string,
  actionText: string,
  dueAt: Date,
  personName: string | null,
): Promise<boolean> {
  if (!supported || dueAt.getTime() <= Date.now()) return false;

  if (!(await requestReminderPermission())) return false;

  try {
    // Replacing rather than adding: re-saving the note twice must not deliver
    // the same reminder twice.
    await cancelReminder(actionId);

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        body: actionText,
        title: personName ? `${personName}さんへの次の一手` : "次の一手",
      },
      trigger: {
        date: dueAt,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
    });

    await AsyncStorage.setItem(storageKey(actionId), identifier);
    return true;
  } catch {
    return false;
  }
}

/** Cancels the reminder for an action that is completed, dismissed or replaced. */
export async function cancelReminder(actionId: string): Promise<void> {
  if (!supported) return;

  try {
    const identifier = await AsyncStorage.getItem(storageKey(actionId));

    if (!identifier) return;

    await Notifications.cancelScheduledNotificationAsync(identifier);
    await AsyncStorage.removeItem(storageKey(actionId));
  } catch {
    // A reminder that cannot be cancelled is a stray notification, not a
    // failure worth interrupting the user for.
  }
}
