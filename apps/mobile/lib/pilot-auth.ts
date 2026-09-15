export function isGuestLoginEnabled(value: string | undefined): boolean {
  return value?.trim() === "1";
}
