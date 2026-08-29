import { meetingGoals, type MeetingGoal } from "@miraio/domain";

export type CapturedCardImage = Readonly<{
  contentType: "image/jpeg";
  height: number;
  uri: string;
  width: number;
}>;

export const meetingGoalLabels: Record<MeetingGoal, string> = {
  networking: "ネットワーキング",
  sales: "営業・商談",
  recruiting: "採用",
  partnership: "協業",
  learning_information_exchange: "学び・情報交換",
  other: "その他",
};

export const meetingGoalOptions = meetingGoals.map((value) => ({
  label: meetingGoalLabels[value],
  value,
}));

export function createScanId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
