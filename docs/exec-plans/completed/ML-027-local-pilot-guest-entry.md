# ML-027 Local Pilot Guest Entry

- Ticket: ML-027
- Priority: P0
- Status: Complete
- Product source: MVP v0.1 authentication and Pilot Release Gates

## Outcome

Let a supervised local PC pilot tester enter Miraio Lens without email setup,
while preserving Supabase Auth identity, API authentication, user-scoped RLS,
and the durable email OTP path.

## In scope

- Environment-gated Supabase anonymous sign-in.
- Clear guest-session and deletion copy.
- Preserve email OTP as a second entry option.
- Local configuration and runbook updates.
- Deterministic flag coverage and live local anonymous-auth smoke validation.

## Out of scope

- Public anonymous signup, production abuse controls, account linking, or guest
  data recovery across devices.

## Acceptance criteria

- [x] Guest entry is hidden unless explicitly enabled.
- [x] One action creates a user-scoped authenticated session.
- [x] Existing email OTP remains available.
- [x] Anonymous users cannot orphan their data through ordinary sign-out UI.
- [x] Guest limitations and deletion are explained in Japanese.
- [x] Local Supabase allows anonymous sign-ins.
- [x] Live local anonymous-auth smoke validation passes.
- [x] Repository quality checks pass.

## Validation evidence

- Created a synthetic anonymous user against the local Supabase stack.
- Confirmed the authenticated session could read its trigger-created profile
  through RLS, then removed the synthetic account.
- Confirmed the PC web layout exposes both guest entry and email OTP without
  creating a browser guest account.
