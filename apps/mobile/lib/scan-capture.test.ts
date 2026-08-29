import { scanCaptureMetadataSchema } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  createScanId,
  meetingGoalLabels,
  meetingGoalOptions,
} from "./scan-capture";

describe("card capture helpers", () => {
  it("defaults can use the canonical networking meeting goal", () => {
    expect(meetingGoalOptions[0]).toEqual({
      label: "ネットワーキング",
      value: "networking",
    });
    expect(meetingGoalLabels.learning_information_exchange).toBe(
      "学び・情報交換",
    );
  });

  it("creates UUID scan IDs accepted by the shared contract", () => {
    const scanId = createScanId();

    expect(
      scanCaptureMetadataSchema.parse({
        content_type: "image/jpeg",
        meeting_goal: "networking",
        scan_id: scanId,
      }).scan_id,
    ).toBe(scanId);
  });
});
