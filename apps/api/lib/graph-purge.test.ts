import { describe, expect, it, vi } from "vitest";

import { createDeleteAccountHandler } from "./account-handlers";
import { createDeleteScanHandler } from "./scan-handlers";

const userId = "00000000-0000-4032-8000-0000000000aa";
const scanId = "00000000-0000-4032-8000-000000000900";

function request(path: string) {
  return new Request(`http://api${path}`, {
    headers: { Authorization: "Bearer valid-token" },
    method: "DELETE",
  });
}

describe("Neo4j projection purge on deletion (ADR-0011)", () => {
  it("purges the owner's projection after a scan is deleted", async () => {
    const purge = vi.fn(async () => undefined);
    const handler = createDeleteScanHandler({
      authenticate: async () => ({
        repository: { deleteScan: async () => true },
        userId,
      }),
      purgeRelationshipGraph: purge,
    });

    const res = await handler(request(`/v1/scans/${scanId}`), {
      params: Promise.resolve({ scanId }),
    });

    expect(res.status).toBe(204);
    expect(purge).toHaveBeenCalledWith(userId);
  });

  it("still reports the scan deleted when the purge fails", async () => {
    const handler = createDeleteScanHandler({
      authenticate: async () => ({
        repository: { deleteScan: async () => true },
        userId,
      }),
      purgeRelationshipGraph: async () => {
        throw new Error("neo4j down");
      },
    });

    const res = await handler(request(`/v1/scans/${scanId}`), {
      params: Promise.resolve({ scanId }),
    });

    expect(res.status).toBe(204);
  });

  it("does not purge when nothing was deleted", async () => {
    const purge = vi.fn(async () => undefined);
    const handler = createDeleteScanHandler({
      authenticate: async () => ({
        repository: { deleteScan: async () => false },
        userId,
      }),
      purgeRelationshipGraph: purge,
    });

    await handler(request(`/v1/scans/${scanId}`), {
      params: Promise.resolve({ scanId }),
    });

    expect(purge).not.toHaveBeenCalled();
  });

  it("purges before deleting the account", async () => {
    const order: string[] = [];
    const handler = createDeleteAccountHandler({
      authenticate: async () => ({
        repository: {
          deleteAccount: async () => {
            order.push("delete");
          },
        },
        userId,
      }),
      purgeRelationshipGraph: async () => {
        order.push("purge");
      },
    });

    const res = await handler(request("/v1/account"));

    expect(res.status).toBe(204);
    expect(order).toEqual(["purge", "delete"]);
  });

  it("keeps the account when the purge fails, so a retry can finish it", async () => {
    const deleteAccount = vi.fn(async () => undefined);
    const handler = createDeleteAccountHandler({
      authenticate: async () => ({ repository: { deleteAccount }, userId }),
      purgeRelationshipGraph: async () => {
        throw new Error("neo4j down");
      },
    });

    const res = await handler(request("/v1/account"));

    expect(res.status).toBe(500);
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
