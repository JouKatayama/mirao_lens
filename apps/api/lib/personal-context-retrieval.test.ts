import type { FlashBriefInput } from "@miraio/domain";
import { describe, expect, it, vi } from "vitest";

import {
  buildTargetContextText,
  personalContextMatchLimit,
  withRetrievedPersonalContext,
} from "./personal-context-retrieval";

const allItems: FlashBriefInput["personal_context"]["items"] = [
  { tags: [], text: "製造業のデータ基盤", type: "strong_skill" },
  { tags: [], text: "無関係な経歴", type: "past_experience" },
];

const input: FlashBriefInput = {
  card: {
    company: "架空製作所",
    department: "データ基盤部",
    language: "ja",
    name: "架空 花子",
    title: "部長",
  },
  company_context: {
    company_description: "産業用センサーの会社",
    company_scale: "sme",
    industry: "製造",
    role_level: "director",
    role_scope: "データ基盤の責任者",
    sources: [],
  },
  locale: "ja",
  meeting_goal: "networking",
  personal_context: {
    current_company: "TestCo",
    current_role: "PM",
    items: allItems,
  },
};

describe("buildTargetContextText", () => {
  it("describes the person from the card and the company context only", () => {
    expect(buildTargetContextText(input)).toBe(
      "架空製作所 / データ基盤部 / 部長 / 製造 / 産業用センサーの会社 / データ基盤の責任者",
    );
  });

  it("never includes the person's name, which identifies rather than describes", () => {
    expect(buildTargetContextText(input)).not.toContain("架空 花子");
  });

  it("is empty when the card says nothing about the work", () => {
    expect(
      buildTargetContextText({
        ...input,
        card: { ...input.card, company: null, department: null, title: null },
        company_context: null,
      }),
    ).toBe("");
  });
});

describe("withRetrievedPersonalContext", () => {
  const retrieved: FlashBriefInput["personal_context"]["items"] = [
    { tags: [], text: "製造業のデータ基盤", type: "strong_skill" },
  ];

  it("replaces the profile with the items that match this person", async () => {
    const matchPersonalContext = vi.fn().mockResolvedValue(retrieved);
    const embed = vi.fn().mockResolvedValue([[1, 0, 0]]);

    const result = await withRetrievedPersonalContext(input, {
      createGenerator: () => ({ embed }),
      matchPersonalContext,
    });

    expect(result.personal_context.items).toEqual(retrieved);
    expect(embed).toHaveBeenCalledWith([buildTargetContextText(input)]);
    expect(matchPersonalContext).toHaveBeenCalledWith(
      "[1,0,0]",
      personalContextMatchLimit,
    );
  });

  it("keeps the whole profile when retrieval is not configured", async () => {
    const matchPersonalContext = vi.fn();

    const result = await withRetrievedPersonalContext(input, {
      createGenerator: () => null,
      matchPersonalContext,
    });

    expect(result.personal_context.items).toEqual(allItems);
    expect(matchPersonalContext).not.toHaveBeenCalled();
  });

  it("keeps the whole profile when there is nothing to match against", async () => {
    const embed = vi.fn();

    const result = await withRetrievedPersonalContext(
      {
        ...input,
        card: { ...input.card, company: null, department: null, title: null },
        company_context: null,
      },
      { createGenerator: () => ({ embed }), matchPersonalContext: vi.fn() },
    );

    expect(result.personal_context.items).toEqual(allItems);
    expect(embed).not.toHaveBeenCalled();
  });

  it("keeps the whole profile when nothing has been embedded yet", async () => {
    const result = await withRetrievedPersonalContext(input, {
      createGenerator: () => ({ embed: async () => [[1, 0, 0]] }),
      matchPersonalContext: async () => null,
    });

    expect(result.personal_context.items).toEqual(allItems);
  });

  it("keeps the whole profile when the match comes back empty", async () => {
    const result = await withRetrievedPersonalContext(input, {
      createGenerator: () => ({ embed: async () => [[1, 0, 0]] }),
      matchPersonalContext: async () => [],
    });

    expect(result.personal_context.items).toEqual(allItems);
  });

  it("keeps the whole profile when the provider fails", async () => {
    const result = await withRetrievedPersonalContext(input, {
      createGenerator: () => ({
        embed: async () => {
          throw new Error("provider down");
        },
      }),
      matchPersonalContext: vi.fn(),
    });

    expect(result.personal_context.items).toEqual(allItems);
  });

  it("keeps the whole profile when the match query fails", async () => {
    const result = await withRetrievedPersonalContext(input, {
      createGenerator: () => ({ embed: async () => [[1, 0, 0]] }),
      matchPersonalContext: async () => {
        throw new Error("dimension mismatch");
      },
    });

    expect(result.personal_context.items).toEqual(allItems);
  });
});
