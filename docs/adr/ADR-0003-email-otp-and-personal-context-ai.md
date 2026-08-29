# ADR-0003: Email OTP and server-side Personal Context structuring

- Status: Accepted
- Date: 2026-08-17

## Context

ML-003 requires an authenticated mobile onboarding flow and real AI-produced,
schema-valid Personal Context suggestions. ML-002 provides Supabase Auth session
persistence but no user-facing sign-in flow. The product specification requires
provider independence in domain logic and explicit user approval before AI
suggestions are used.

The private pilot needs a low-friction sign-in path. A native magic-link flow
would add deep-link and redirect configuration before the product has validated
the Personal Context experience.

## Decision

- Use Supabase email OTP with a six-digit code for the private-pilot mobile
  entry flow.
- Send the code with `signInWithOtp` and create the session with `verifyOtp`.
  The local Supabase email template uses `{{ .Token }}` and Mailpit captures the
  message. Hosted projects must configure the equivalent OTP template.
- Use OpenAI as the initial server-side Personal Context structuring provider.
- Call the Responses API through the official server SDK with strict Zod
  structured output and response storage disabled.
- Keep the model ID in `AI_PERSONAL_CONTEXT_MODEL`; no model ID belongs in
  domain code.
- Define `PersonalContextStructurer` as a provider-neutral boundary in
  `packages/ai`. Canonical item types and validation remain in
  `packages/domain`.
- Persist AI suggestions as unapproved. Only an explicit user action can make
  them available through the approved-context query.

## Consequences

- The mobile flow does not require password creation or native deep-link
  handling for the pilot.
- OTP email templates must be configured consistently in local and hosted
  Supabase environments.
- A real onboarding request requires server-side OpenAI credentials and a
  configured model alias; CI uses an injected deterministic adapter and no
  secret.
- OpenAI can be replaced without changing mobile/API contracts, persistence,
  or canonical domain concepts.
- Raw Personal Context necessarily reaches the selected AI provider for this
  structuring stage, but is not included in normal application logs or stored
  as raw prompt/response data by Miraio Lens.

## Alternatives considered

### Magic links

Deferred because a robust native flow requires universal/deep-link setup and
redirect handling. It can be reconsidered after the private pilot.

### Email and password

Rejected for the pilot because password creation and recovery add friction and
support work unrelated to the core Personal Context hypothesis.

### Provider code in the Route Handler

Rejected because it would couple orchestration and product behavior to one SDK
and weaken the existing modular-monolith boundary.
