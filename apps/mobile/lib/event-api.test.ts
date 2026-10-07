import { describe, expect, it, vi } from "vitest";

import { EventApiClient } from "./event-api";

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "展示会",
  created_at: "2026-11-03T00:00:00Z",
};

describe("EventApiClient", () => {
  it("authenticates and validates an event creation", async () => {
    const fetcher = vi.fn(async () => Response.json(event, { status: 201 }));
    const client = new EventApiClient("https://example.invalid", fetcher);
    await expect(client.create("token", "展示会")).resolves.toEqual(event);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.invalid/v1/events",
      expect.objectContaining({
        body: JSON.stringify({ name: "展示会" }),
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
        method: "POST",
      }),
    );
  });

  it("sends only the selected scan to the selected event", async () => {
    const fetcher = vi.fn(async () => Response.json({}));
    const client = new EventApiClient("https://example.invalid", fetcher);
    await client.attach(
      "token",
      event.id,
      "22222222-2222-4222-8222-222222222222",
    );
    expect(fetcher).toHaveBeenCalledWith(
      `https://example.invalid/v1/events/${event.id}/scans`,
      expect.objectContaining({
        body: JSON.stringify({
          scan_id: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );
  });
});
