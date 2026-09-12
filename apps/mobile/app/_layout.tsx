import { Stack } from "expo-router";

import { configureReminderNotifications } from "../lib/reminders";

// Set before any screen mounts: without a handler, expo-notifications drops a
// reminder that arrives while the app is open instead of showing it.
configureReminderNotifications();

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
