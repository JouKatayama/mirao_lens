import type { MobileSupabaseClient } from "./supabase";

type GuestUpgradeAuth = Pick<
  MobileSupabaseClient["auth"],
  "getUser" | "updateUser" | "verifyOtp" | "refreshSession"
>;

export class GuestUpgradeError extends Error {
  constructor(
    readonly code:
      | "invalid_email"
      | "not_guest"
      | "send_failed"
      | "invalid_code"
      | "verification_failed"
      | "identity_changed",
  ) {
    super(code);
    this.name = "GuestUpgradeError";
  }
}

export function normalizeGuestEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new GuestUpgradeError("invalid_email");
  }
  return normalized;
}

/** Add an email to the existing anonymous owner; never sign into another user. */
export async function requestGuestEmail(
  auth: Pick<GuestUpgradeAuth, "getUser" | "updateUser">,
  guestId: string,
  email: string,
): Promise<string> {
  const normalized = normalizeGuestEmail(email);
  const { data, error } = await auth.getUser();
  if (error || data.user?.id !== guestId || !data.user.is_anonymous) {
    throw new GuestUpgradeError("not_guest");
  }

  const result = await auth.updateUser({ email: normalized });
  if (result.error) throw new GuestUpgradeError("send_failed");
  return normalized;
}

/** Confirmation must keep the user id, or the guest's data was not recovered. */
export async function confirmGuestEmail(
  auth: Pick<GuestUpgradeAuth, "verifyOtp" | "refreshSession" | "getUser">,
  guestId: string,
  email: string,
  code: string,
): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new GuestUpgradeError("invalid_code");

  const result = await auth.verifyOtp({
    email: normalizeGuestEmail(email),
    token: code,
    type: "email_change",
  });
  if (result.error) throw new GuestUpgradeError("verification_failed");

  const refreshed = await auth.refreshSession();
  if (refreshed.error) throw new GuestUpgradeError("verification_failed");
  const current = await auth.getUser();
  if (
    current.error ||
    current.data.user?.id !== guestId ||
    current.data.user.is_anonymous
  ) {
    throw new GuestUpgradeError("identity_changed");
  }
}
