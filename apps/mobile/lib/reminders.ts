import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { readReminderScanId, toReminderTarget } from "./reminder-target";

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
  scanId: string,
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
        // Carried by the notification itself: the tap has to lead back to this
        // person days later, on a device that may have been offline or asleep
        // in between.
        data: toReminderTarget(scanId),
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

/**
 * A tap is only worth acting on once. The response that launched the app is
 * still readable after it has been handled, and a re-subscribe would otherwise
 * navigate the user back out of wherever they had gone next.
 */
let handledTapIdentifier: string | null = null;

/**
 * Calls back with the scan a tapped reminder points at, for as long as the
 * subscription is held. Returns the unsubscribe.
 */
export function subscribeToReminderTaps(
  onTap: (scanId: string) => void,
): () => void {
  if (!remindersSupported) {
    return () => {};
  }

  let active = true;

  function handle(response: Notifications.NotificationResponse | null): void {
    if (!active || !response) {
      return;
    }

    const identifier = response.notification.request.identifier;

    if (identifier === handledTapIdentifier) {
      return;
    }

    const scanId = readReminderScanId(
      response.notification.request.content.data,
    );

    if (!scanId) {
      return;
    }

    handledTapIdentifier = identifier;
    onTap(scanId);
  }

  // A tap that launched the app happened before any listener could exist, so
  // the launch response is asked for rather than waited for.
  void Notifications.getLastNotificationResponseAsync()
    .then(handle)
    .catch(() => {
      // No launch notification is the ordinary case, not a failure.
    });

  const subscription =
    Notifications.addNotificationResponseReceivedListener(handle);

  return () => {
    active = false;
    subscription.remove();
  };
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
