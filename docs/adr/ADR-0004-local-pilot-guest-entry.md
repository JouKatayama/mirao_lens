# ADR-0004: Environment-gated guest entry for the local pilot

- Status: Accepted
- Date: 2026-09-15

## Context

ADR-0003 selected six-digit email OTP as the durable private-pilot sign-in
method. The first supervised desktop pilot also needs a registration-free path
so a tester can reach the product value without configuring local email
delivery or creating credentials.

Miraio Lens still stores private Personal Context and business-card data. A
guest path therefore cannot bypass Supabase Auth, API bearer authentication, or
database row-level security.

## Decision

- Keep email OTP as the durable/default sign-in method.
- Add a guest entry only when `EXPO_PUBLIC_ENABLE_GUEST_LOGIN=1`.
- Implement guest entry with Supabase anonymous sign-in. The resulting user has
  an authenticated session and a unique Auth UUID, so existing API checks,
  ownership columns, Storage paths, and RLS policies remain unchanged.
- Enable anonymous sign-ins in the committed local Supabase configuration.
  Hosted environments must make the equivalent explicit provider-side choice
  before enabling the mobile flag.
- Do not show ordinary sign-out to anonymous users because it would orphan data
  that cannot be recovered. Offer account/data deletion as the guest exit.
- Explain that clearing browser storage loses access to the guest history.

## Consequences

- A supervised tester can enter with one action and no inbox setup.
- Guest and email users share the same downstream product and security paths.
- Guest history is device/browser-bound and is not recoverable after local
  session storage is cleared.
- Public deployments must add abuse controls and an explicit release decision
  before enabling guest entry.

## Relationship to earlier decisions

This record adds a local-pilot exception to ADR-0003; it does not replace email
OTP as the durable sign-in method. ADR-0002 remains unchanged because anonymous
Auth users operate through the authenticated database role and user-scoped RLS.
