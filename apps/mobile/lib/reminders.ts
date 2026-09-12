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
// crash on it. Exported because a screen that offers a reminder has to say
// whether one can actually be delivered here.
export const remindersSupported = Platform.OS !== "web";

/**
 * Without a handler, expo-notifications drops a notification that arrives
 * while the app is in the foreground: the 9am reminder would simply vanish
 * for a user who happens to have Miraio open. Call once at app start.
 */
export function configureReminderNotifications(): void {
  if (!remindersSupported) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestReminderPermission(): Promise<boolean> {
  if (!remindersSupported) return false;

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
  if (!remindersSupported || dueAt.getTime() <= Date.now()) return false;

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

    try {
      await AsyncStorage.setItem(storageKey(actionId), identifier);
    } catch (error) {
      // The stored identifier is the only handle on this notification. Left
      // unstored, the reminder could never be cancelled and would fire after
      // the action was completed, so undo the schedule instead.
      await Notifications.cancelScheduledNotificationAsync(identifier);
      throw error;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Drops every reminder this device holds. Used when the account is deleted or
 * signed out: a notification naming a contact must not outlive the data it
 * came from, or surface to whoever signs in next.
 */
export async function cancelAllReminders(): Promise<void> {
  if (!remindersSupported) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const keys = await AsyncStorage.getAllKeys();
    const owned = keys.filter((key) => key.startsWith(`${storageKeyPrefix}.`));

    if (owned.length > 0) {
      await AsyncStorage.multiRemove(owned);
    }
  } catch {
    // Best effort: failing to clear reminders must not block a sign-out.
  }
}

/** Cancels the reminder for an action that is completed, dismissed or replaced. */
export async function cancelReminder(actionId: string): Promise<void> {
  if (!remindersSupported) return;

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
