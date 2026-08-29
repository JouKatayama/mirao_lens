# ML-002 Supabase Foundation execution plan

- Ticket: ML-002
- Priority: P0
- Status: Complete
- Scope source: MVP v0.1 product specification backlog and data/security sections

## Objective

Create a reproducible Supabase development foundation with Auth, PostgreSQL,
private Storage, user-scoped RLS, deterministic non-PII seed data, and typed
client boundaries for subsequent product tickets.

## Acceptance criteria

- Supabase CLI configuration is committed and contains no secrets.
- One replayable migration creates the MVP v0.1 data model.
- Every exposed user-owned table has authenticated-user RLS and no anonymous
  data access.
- Cross-user scan children are prevented with composite foreign keys.
- A private business-card image bucket restricts objects to a user's own path.
- New Auth users receive a profile row.
- Seed data is deterministic, non-PII, and contains no login credential.
- Expo has a public-key-only Supabase Auth client foundation with persisted
  sessions; no service-role key can enter the mobile bundle.
- Database types are generated from the local schema.
- Database tests, repository quality checks, and CI validation pass.

## Out of scope

- login or signup UI,
- hosted Supabase project provisioning or linking,
- Personal Context UI or AI structuring,
- camera capture, image upload, OCR, or image cleanup jobs,
- API feature endpoints,
- provider credentials or production deployment.

## Validation

```bash
pnpm install --frozen-lockfile
pnpm supabase:start
pnpm db:reset
pnpm db:test
pnpm db:types
pnpm check
```

The local Supabase stack requires a running Docker-compatible engine.

## Completion validation

- Frozen lockfile install passed.
- Local Supabase started on the repository-specific `5632x` ports.
- Database reset replayed the migration and seed from an empty database.
- Schema lint reported no errors.
- Two pgTAP files passed 34 database and RLS assertions.
- Generated database types were byte-identical across two generations.
- `pnpm check` passed lint, strict typecheck, six unit tests, and all builds.
