# Miraio Lens

Miraio Lens is a **First-Meeting Relationship Intelligence** product. It uses a
business-card exchange as the trigger for finding useful, grounded connections
between a newly met person and the user's professional context. It is not a
generic CRM or digital business-card replacement.

## Current implementation

ML-001 through ML-017 currently provide:

- an Expo Router mobile flow with email OTP, Personal Context onboarding,
  explicit suggestion review, and My Context management,
- a Next.js API/BFF with `GET /api/health` and authenticated `/v1/context`
  endpoints,
- explicit domain, AI, database, shared, UI-token, and fixture packages,
- strict TypeScript, ESLint, Prettier, Vitest, Turborepo, and root commands,
- GitHub Actions validation,
- architecture, product, ADR, and execution documentation,
- a reproducible local Supabase Auth/PostgreSQL/Storage stack,
- the MVP schema with user-scoped RLS and private card-image storage,
- deterministic non-PII seed data and generated database types,
- an Expo Supabase Auth client with native session persistence,
- canonical Personal Context contracts, atomic/idempotent persistence, and
  approved-only retrieval,
- a provider-neutral AI boundary with an initial server-only OpenAI Responses
  structured-output adapter,
- an Expo Camera card-capture flow with on-demand permission, frame guide,
  preview/retake, meeting-goal selection, and retryable private upload,
- an authenticated `POST /v1/scans` binary-upload handoff with idempotent scan
  IDs, one-hour raw-image expiry metadata, and user-prefixed private storage,
- a provider-neutral Card Intelligence stage with strict eight-field
  extraction, per-field confidence, owner-scoped FACT Evidence, retryable
  failures, and AI-run latency metadata,
- response-after extraction scheduling, immediate raw-image deletion after a
  successful extraction, authenticated status/card-correction APIs, and a
  mobile card review/correction flow,
- 10 deterministic synthetic Card Intelligence fixtures covering Japanese,
  English, mixed, missing-field, limited-quality, and contact variants,
- Flash Brief generation with grounded context matching and a mobile brief
  viewing flow,
- deep enrichment via company-context, identity resolution, mutual-value, and
  evidence chain stages with per-stage AI-run latency tracking,
- an Interaction layer with conversation notes, next-action capture, and
  acceptance tracking,
- scan history listing with status badges and a mobile history screen,
- source URL opening from the brief and mutual-value views,
- event analytics via the PostHog HTTP Capture API with 17 named events
  covering activation, scan funnel, value, and trust categories,
- individual scan deletion (`DELETE /v1/scans/:scanId`) and full account
  deletion (`DELETE /v1/account`) with storage cleanup and cascading DB removal,
- an authenticated `POST /api/internal/cleanup-expired-scans` sweep that
  removes raw card images whose expiry has passed, using a service-role client
  to cross user boundaries.

## Repository map

```text
apps/
  mobile/          Expo + Expo Router delivery layer
  api/             Next.js Route Handler API/BFF
packages/
  domain/          Portable business concepts and contracts
  ai/              Provider-neutral AI boundary and OpenAI adapter
  db/              Supabase types and user-scoped persistence adapters
  shared/          Generic utilities only
  ui-tokens/       Small visual token layer
  test-fixtures/   Deterministic non-PII fixtures
docs/              Product, architecture, ADR, and execution plans
evals/             Future AI golden datasets and scoring
supabase/          Local config, migrations, RLS tests, and non-PII seed
```

## Prerequisites

- Node.js 22.13 or newer
- pnpm 11.19.0
- Docker Desktop or another Docker-compatible engine for local Supabase

The Node version satisfies Expo SDK 57 and Next.js requirements. The exact pnpm
version is recorded in `package.json` and used by CI.

## Install

From this repository root:

```bash
pnpm install --frozen-lockfile
```

During initial repository creation, before a lockfile exists, use `pnpm
install`. After that, keep the lockfile committed and use the frozen command in
CI and reproducibility checks.

## Environment setup

Create separate environment files so server secrets can never enter the mobile
bundle:

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local
```

`EXPO_PUBLIC_*` values are exposed to the client. Use only a Supabase
publishable/anon key there. Service-role, AI-provider, and job-signing values
are server-only and must never be placed in mobile code. Real `.env*` files are
gitignored.

For local development, run `pnpm supabase:start` and copy its local API URL and
publishable key into both app environment files. Add a server-only
`OPENAI_API_KEY`, `AI_PERSONAL_CONTEXT_MODEL`, and
`AI_CARD_EXTRACTION_MODEL` to `apps/api/.env.local`. The model variables are
server-side aliases/configuration and may point to different models. The
printed local keys are development-only; do not commit a populated environment
file.

To enable the cleanup sweep locally, also set `SUPABASE_SERVICE_ROLE_KEY`
(printed by `pnpm supabase:start`) and choose any `CLEANUP_SECRET` value in
`apps/api/.env.local`.

For a physical device, replace `127.0.0.1` in the mobile API/Supabase URLs with
the development machine's reachable LAN address. The API environment continues
to use its own server-reachable Supabase URL.

## Run Supabase locally

```bash
pnpm supabase:start
pnpm db:reset
pnpm db:test
pnpm db:lint
pnpm db:types
```

The Miraio stack uses ports `56320`–`56326` to avoid common default Supabase
ports. `db:reset` recreates the database, applies all migrations, and runs the
deterministic seed. `db:types` regenerates
`packages/db/src/database.types.ts` from the running local schema.

Local OTP emails are captured at `http://127.0.0.1:56324`. Open the newest
message and enter its six-digit code in the app. For a hosted project, configure
the Magic Link/OTP email template to contain `{{ .Token }}`.

Stop the stack without retaining a local backup:

```bash
pnpm supabase:stop
```

## Run the API

```bash
pnpm dev:api
```

Open `http://localhost:3000/api/health`. Expected response:

```json
{
  "status": "ok",
  "service": "miraio-lens-api"
}
```

ML-003 API resources are:

```text
POST   /v1/context/onboarding
GET    /v1/context
PATCH  /v1/context/:itemId
DELETE /v1/context/:itemId
```

They require the mobile Supabase access token as a Bearer token. Unapproved AI
suggestions are never returned by `GET /v1/context`.

ML-004 adds:

```text
POST /v1/scans
```

The mobile client sends the private image as a binary body with
`X-Scan-Id`, `X-Meeting-Goal`, and an accepted image `Content-Type`. The server
derives ownership from the Bearer session, stores the object below the
authenticated user prefix, and advances the scan to `extracting_card`. The
public response uses the product-contract status `extracting`.

ML-005 adds:

```text
GET   /v1/scans/:scanId/status
PATCH /v1/scans/:scanId/card
```

After the upload response, the API schedules Card Intelligence with Next.js
response-after work. It downloads the image through the same user-scoped
Supabase session, validates strict structured output, persists nullable card
facts and confidence, records Evidence/AI-run metadata, advances to
`card_ready`, and deletes the private raw image. A failed deletion leaves the
path expired for a later cleanup sweep. Deployments must support Next.js
`after()`/`waitUntil` semantics or replace this adapter with a durable queue.

The correction route accepts only `name`, `company`, `department`, `title`,
`email`, `phone`, `website`, and `address`. Original extraction JSON is
preserved while user-correction provenance is added separately.

ML-006 through ML-014 add Flash Brief generation, deep enrichment stages
(company context, identity resolution, mutual value, evidence chains),
interaction logging (notes and next actions), scan history listing, and source
URL opening.

ML-015 adds event analytics via the PostHog HTTP Capture API. Set
`EXPO_PUBLIC_POSTHOG_API_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` in the mobile
environment to enable tracking; the client is a no-op when the key is absent.

ML-016 adds:

```text
DELETE /v1/scans/:scanId
DELETE /v1/account
```

`DELETE /v1/scans/:scanId` removes the scan, its storage files, and all child
DB rows (via cascade) and returns 204. `DELETE /v1/account` deletes all user
storage, then calls a `SECURITY DEFINER` Postgres function that removes the
row from `auth.users`, cascading all user-owned tables. Both routes require a
Bearer token.

ML-017 adds:

```text
POST /api/internal/cleanup-expired-scans
```

This sweep runs with a service-role Supabase client (bypassing RLS) and
deletes raw card images whose `raw_image_expires_at` has passed — covering
cases where `after()` deletion failed. Protect with `X-Cleanup-Secret` header
and a matching `CLEANUP_SECRET` env var. Requires `SUPABASE_SERVICE_ROLE_KEY`.
Suitable for invocation from Vercel Cron or an external scheduler. Returns
`{ deleted_count, failed_count, status }`.

## Run the mobile app

```bash
pnpm dev:mobile
```

Use the Expo CLI prompts to open iOS, Android, or web. Platform SDKs or a
physical device are required for native launch; the repository build validates
the web export without a simulator.

The camera flow requires a physical device or camera-capable simulator. Camera
permission is not requested at app launch: open **Home / Scan**, press **名刺を撮影する**,
then press **カメラを許可**. Use fictional test-card content only. The captured
JPEG remains local until the explicit upload action.

After upload, the accepted screen polls only while extraction is active. Ready
fields are labeled **FACT / 名刺** and can be edited or cleared. Retryable
extraction failures reuse the captured local image and stable scan ID while the
temporary file remains available.

To start both long-running development tasks through Turborepo:

```bash
pnpm dev
```

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm check` is the main local quality gate and runs the four checks in order.

The opt-in ML-005 local integration test needs a running local Supabase stack
and local-only keys supplied through the shell environment:

```bash
MIRAIO_RUN_SUPABASE_INTEGRATION=1 \
SUPABASE_URL=... \
SUPABASE_PUBLISHABLE_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
pnpm --filter @miraio/api exec vitest run \
  lib/card-intelligence.integration.test.ts
```

It creates only a generated `.invalid` user and four generated bytes, then
deletes the user. Never substitute a hosted production project or real card
data for this smoke test.

Formatting is available separately:

```bash
pnpm format:check
pnpm format
```

## Development workflow

1. Read `AGENTS.md`, the active ticket, and the relevant product/architecture
   documents.
2. Keep UI and delivery concerns in `apps/*`.
3. Keep business meaning portable in `packages/domain`.
4. Put vendor-specific AI and persistence code behind `packages/ai` and
   `packages/db` boundaries.
5. Add deterministic tests without real personal or business-card data.
6. For schema changes, add a migration and database test, then run `pnpm
db:reset`, `pnpm db:test`, and `pnpm db:types`.
7. Run `pnpm check` before handing work off.
8. Record durable architectural decisions in `docs/adr/`.

## Documentation

- Product specification: `docs/product-specs/miraio-lens-mvp-v0.1.md`
- Architecture overview: `ARCHITECTURE.md`
- Architecture documentation: `docs/architecture/index.md`
- Decision records: `docs/adr/`
- Active execution plans: `docs/exec-plans/active/`
- Agent repository instructions: `AGENTS.md`
