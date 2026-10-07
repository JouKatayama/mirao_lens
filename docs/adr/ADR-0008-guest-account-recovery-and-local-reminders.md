# ADR-0008: Recover guest accounts and local reminders

- Status: Accepted
- Date: 2026-10-07

## Context

ADR-0004 introduced anonymous sign-in for the local pilot. An anonymous user's
data is server-side but becomes inaccessible when the device session is lost.
Next Actions have server-side `due_at` values, while their notifications exist
only on the device. Reinstalling the app therefore preserves an email user's
records but removes scheduled notifications.

## Decision

- Keep email OTP as the durable sign-in method. A signed-in guest can add a new
  email to the **same** Supabase Auth user and verify its email-change OTP. The
  user ID must remain unchanged, so no business data is reassigned.
- Do not merge a guest with an existing email account automatically. That needs
  an explicit ownership and conflict-resolution design.
- After sign-in, fetch the owner's future accepted Next Actions and reconcile
  local notifications by action ID. The read is authenticated and RLS-scoped.
  Do not prompt for notification permission merely because the user signed in.
- Keep notifications local. The server stores the action and due time, not a
  device token or push job. Reinstalling or signing in on another device can
  recreate future reminders once that device has notification permission.

## Consequences

- Hosted Supabase projects that offer guest conversion must enable manual
  identity linking and email confirmation, then configure email-change and
  new-user confirmation OTP templates. With email confirmation disabled,
  Supabase converts the anonymous user immediately without sending the expected
  verification code. With it enabled, new email sign-ups use the confirmation
  template rather than the magic-link template.
- The local pilot's anonymous account is recoverable only after the user
  confirms an email. An unconverted guest who loses the session still cannot
  recover the account.
- Past-due actions remain in the app but are not retroactively notified.
- The user must grant notification permission on each device. Delivery still
  depends on the device operating system.
