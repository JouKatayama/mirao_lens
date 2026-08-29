import type { IdentityStatus } from "./flash-brief/flash-brief";

export const identityStatuses = [
  "verified",
  "high_confidence",
  "medium_confidence",
  "unresolved",
] as const;

export function isIdentityStatus(value: string): value is IdentityStatus {
  return (identityStatuses as readonly string[]).includes(value);
}

export * from "./analytics/analytics";
export * from "./company-context/company-context";
export * from "./context/personal-context";
export * from "./card-intelligence/card-extraction";
export * from "./evidence/evidence";
export * from "./flash-brief/flash-brief";
export * from "./interaction/interaction";
export * from "./mutual-value/mutual-value";
export * from "./scan/card-scan";
