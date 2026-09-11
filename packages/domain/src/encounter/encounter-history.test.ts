import { describe, expect, it } from "vitest";

import {
  encounterHistoryResponseSchema,
  encounterNoteExcerptLength,
  toEncounterNoteExcerpt,
  toEncounterOrdinal,
} from "./encounter-history";

const scanId = "00000000-0000-4013-8000-000000000901";

describe("encounterHistoryResponseSchema", () => {
  it("accepts a response with earlier encounters", () => {
    const parsed = encounterHistoryResponseSchema.parse({
      items: [
        {
          created_at: "2026-08-20T04:00:00.000Z",
          meeting_goal: "networking",
          note_excerpt: "前回は採用の話をした",
          scan_id: scanId,
        },
      ],
      scan_id: "00000000-0000-4013-8000-000000000902",
    });

    expect(parsed.items).toHaveLength(1);
  });

  it("accepts an empty history", () => {
    expect(
      encounterHistoryResponseSchema.parse({ items: [], scan_id: scanId })
        .items,
    ).toEqual([]);
  });

  it("rejects an unknown meeting goal", () => {
    expect(() =>
      encounterHistoryResponseSchema.parse({
        items: [
          {
            created_at: "2026-08-20T04:00:00.000Z",
            meeting_goal: "gossip",
            note_excerpt: null,
            scan_id: scanId,
          },
        ],
        scan_id: scanId,
      }),
    ).toThrow();
  });
});

describe("toEncounterNoteExcerpt", () => {
  it("collapses whitespace into one line", () => {
    expect(toEncounterNoteExcerpt("採用の話\n\n  次は事例を共有")).toBe(
      "採用の話 次は事例を共有",
    );
  });

  it("truncates a long note", () => {
    const excerpt = toEncounterNoteExcerpt("あ".repeat(400));
    expect(excerpt).toHaveLength(encounterNoteExcerptLength + 1);
    expect(excerpt?.endsWith("…")).toBe(true);
  });

  it("returns null for an absent or blank note", () => {
    expect(toEncounterNoteExcerpt(null)).toBeNull();
    expect(toEncounterNoteExcerpt(undefined)).toBeNull();
    expect(toEncounterNoteExcerpt("   \n ")).toBeNull();
  });
});

describe("toEncounterOrdinal", () => {
  it("counts the current encounter as well", () => {
    expect(toEncounterOrdinal(0)).toBe(1);
    expect(toEncounterOrdinal(2)).toBe(3);
  });
});
