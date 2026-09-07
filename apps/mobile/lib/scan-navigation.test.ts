import { describe, expect, it } from "vitest";
import { isScanPending, scanNavigationTarget } from "./scan-navigation";

describe("scan screen navigation", () => {
  it("shows the person summary when reopening an already analysed scan", () => {
    expect(scanNavigationTarget("scan-accepted", "deep_ready")).toBe(
      "flash-brief",
    );
  });
  it.each([
    "flash-brief",
    "preparation",
    "mutual-value",
    "card-details",
    "interaction",
  ])("does not dismiss %s when analysis completes", (screen) => {
    expect(scanNavigationTarget(screen, "deep_ready")).toBeNull();
  });
  it("keeps polling between extraction, brief generation and deep enrichment", () => {
    expect(isScanPending("card_ready")).toBe(true);
    expect(isScanPending("brief_ready")).toBe(true);
    expect(isScanPending("deep_enrichment")).toBe(true);
    expect(isScanPending("deep_ready")).toBe(false);
    expect(isScanPending("failed_terminal")).toBe(false);
  });
  it("shows the existing recovery screen after enrichment fails", () => {
    expect(scanNavigationTarget("mutual-value", "failed_retryable")).toBe(
      "scan-accepted",
    );
    expect(scanNavigationTarget("flash-brief", "failed_terminal")).toBe(
      "scan-accepted",
    );
  });
});
