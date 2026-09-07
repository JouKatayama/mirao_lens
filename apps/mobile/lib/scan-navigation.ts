import type { ScanStatusResponse } from "@miraio/domain";

/** Keep polling transitional stages, including brief-ready before enrichment is claimed. */
export function isScanPending(status: ScanStatusResponse["status"]): boolean {
  return [
    "extracting",
    "card_ready",
    "generating_brief",
    "brief_ready",
    "deep_enrichment",
  ].includes(status);
}

/** Background work must not dismiss preparation, tabs, editing, or a conversation note. */
export function scanNavigationTarget(
  view: string,
  status: ScanStatusResponse["status"],
): "flash-brief" | "scan-accepted" | null {
  if (
    (view === "flash-brief" ||
      view === "mutual-value" ||
      view === "preparation") &&
    (status === "failed_retryable" || status === "failed_terminal")
  )
    return "scan-accepted";
  if (
    view === "scan-accepted" &&
    ["brief_ready", "deep_enrichment", "deep_ready"].includes(status)
  )
    return "flash-brief";
  return null;
}
