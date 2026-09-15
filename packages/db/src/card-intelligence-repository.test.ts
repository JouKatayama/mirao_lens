import { normalizeCardExtraction } from "@miraio/domain";
import { describe, expect, it, vi } from "vitest";

import { CardIntelligenceRepository } from "./card-intelligence-repository";

describe("CardIntelligenceRepository", () => {
  it("keeps private database columns out of the returned business card", async () => {
    const extraction = normalizeCardExtraction({
      address: null,
      company: "Fixture Labs",
      department: null,
      email: "fixture@example.invalid",
      field_confidence: {
        address: 0,
        company: 0.98,
        department: 0,
        email: 0.95,
        name: 0.99,
        phone: 0,
        title: 0.97,
        website: 0,
      },
      language: "en",
      name: "Fixture Person",
      phone: null,
      title: "Test Lead",
      website: null,
    });
    const row = {
      ...extraction,
      created_at: "2026-09-15T00:00:00.000Z",
      extraction_json: extraction,
      id: "00000000-0000-4000-8000-000000000501",
      organization_id: "00000000-0000-4000-8000-000000000502",
      person_id: null,
      scan_id: "00000000-0000-4000-8000-000000000503",
      updated_at: "2026-09-15T00:00:00.000Z",
      user_corrected: false,
      user_id: "00000000-0000-4000-8000-000000000504",
    };
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [row], error: null }),
    };
    const repository = new CardIntelligenceRepository(client as never);

    const result = await repository.completeExtraction(
      row.scan_id,
      "00000000-0000-4000-8000-000000000505",
      extraction,
      42,
    );

    expect(result).toMatchObject({
      company: "Fixture Labs",
      name: "Fixture Person",
      scan_id: row.scan_id,
    });
    expect(result).not.toHaveProperty("user_id");
    expect(result).not.toHaveProperty("person_id");
    expect(result).not.toHaveProperty("organization_id");
  });
});
