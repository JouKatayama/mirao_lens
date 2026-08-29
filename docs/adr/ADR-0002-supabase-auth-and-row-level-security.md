# ADR-0002: Supabase Auth and user-scoped row-level security

- Status: Accepted
- Date: 2026-08-17

## Context

Miraio Lens stores private Personal Context, business-card facts, research
evidence, relationship analysis, and notes. The MVP product specification
requires strict user isolation, private temporary card images, Supabase Auth,
PostgreSQL, Storage, and pgvector.

The mobile app needs direct authenticated access through a publishable key,
while privileged service credentials must remain server-only.

## Decision

- Supabase Auth UUIDs are the ownership root for all user data.
- Every exposed user-owned table contains a direct `user_id` (or explicit
  `owner_user_id`) and enables RLS for the `authenticated` role.
- The `anon` database role receives no table privileges or policies.
- Scan child tables use composite `(scan_id, user_id)` foreign keys, preventing
  cross-user relationships even outside the Data API.
- A trigger creates one profile for each Auth user.
- Business-card images use a private Storage bucket. CRUD policies require the
  first object-path segment to equal the authenticated user ID.
- Mobile code uses only `EXPO_PUBLIC_*` URL and publishable/anon key variables.
  Service-role keys are never accepted by the mobile client factory.
- Schema changes are migrations, verified with local reset, pgTAP tests, lint,
  and generated TypeScript types.

## Consequences

- Data isolation is enforced in PostgreSQL rather than relying only on API
  handlers.
- Each scan-scoped table duplicates `user_id`; this is deliberate defense in
  depth and enables simple, indexable RLS policies.
- User ownership must be supplied on inserts, and later repositories should
  derive it from the authenticated session rather than caller-controlled input.
- Storage objects must follow the `user-id/...` path convention.
- Local database validation requires Docker.

## Alternatives considered

### API-only authorization

Rejected because direct Data API access with a publishable key would make one
missed server check a cross-user data risk.

### Shared records without direct ownership columns

Rejected for MVP because join-based policies are harder to audit and can make
cross-user linkage mistakes less visible.

### Service-role access from mobile

Rejected because a client bundle cannot protect privileged credentials and a
service-role key bypasses RLS.
