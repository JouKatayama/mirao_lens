import { describe, expect, it } from "vitest";

import { GET, healthResponse } from "./route";

describe("GET /api/health", () => {
  it("returns the service health payload", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(healthResponse);
  });
});
