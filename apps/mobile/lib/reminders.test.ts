import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const stored = new Map<string, string>();
  return {
    stored,
    getPermissionsAsync: vi.fn(),
    requestPermissionsAsync: vi.fn(),
    scheduleNotificationAsync: vi.fn(),
    cancelScheduledNotificationAsync: vi.fn(),
  };
});

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: async () => [...mocks.stored.keys()],
    getItem: async (key: string) => mocks.stored.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mocks.stored.set(key, value);
    },
    removeItem: async (key: string) => {
      mocks.stored.delete(key);
    },
  },
}));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: mocks.getPermissionsAsync,
  requestPermissionsAsync: mocks.requestPermissionsAsync,
  scheduleNotificationAsync: mocks.scheduleNotificationAsync,
  cancelScheduledNotificationAsync: mocks.cancelScheduledNotificationAsync,
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import { restoreReminders } from "./reminders";

const action = {
  action_text: "架空の相手に連絡する",
  due_at: "2099-01-01T09:00:00.000Z",
  id: "00000000-0000-4013-8000-000000000901",
  scan_id: "00000000-0000-4013-8000-000000000801",
  source: "user" as const,
  status: "accepted" as const,
  timing_text: null,
};

describe("restoreReminders", () => {
  beforeEach(() => {
    mocks.stored.clear();
    vi.clearAllMocks();
    mocks.getPermissionsAsync.mockResolvedValue({ granted: true });
    mocks.scheduleNotificationAsync.mockResolvedValue("notification-1");
  });

  it("recreates a future reminder after reinstall without prompting for permission", async () => {
    await restoreReminders([action], () => true);
    expect(mocks.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocks.stored.get(`miraio.reminder.${action.id}`)).toBe(
      "notification-1",
    );
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("removes a stale notification when the server no longer lists its action", async () => {
    mocks.stored.set(`miraio.reminder.${action.id}`, "notification-1");
    await restoreReminders([], () => true);
    expect(mocks.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "notification-1",
    );
    expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does not restore notifications after the user signed out", async () => {
    await restoreReminders([action], () => false);
    expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("reports that permission is needed without prompting on sign-in", async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(restoreReminders([action], () => true)).resolves.toBe(false);
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
