import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "./database.types";
import { InteractionRepository } from "./interaction-repository";

describe("listFutureReminders", () => {
  it("reads accepted future actions through the user-scoped client", async () => {
    const range = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi
      .fn()
      .mockReturnValue({ order: vi.fn().mockReturnValue({ range }) });
    const gt = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ gt });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(
      new InteractionRepository(client).listFutureReminders(
        "2030-01-01T00:00:00Z",
      ),
    ).resolves.toEqual([]);
    expect(from).toHaveBeenCalledWith("next_actions");
    expect(eq).toHaveBeenCalledWith("status", "accepted");
    expect(gt).toHaveBeenCalledWith("due_at", "2030-01-01T00:00:00Z");
    expect(range).toHaveBeenCalledWith(0, 499);
  });
});
