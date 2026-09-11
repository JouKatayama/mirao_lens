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
  viewing flow, including a 1-5 POTENTIAL heuristic, connection keywords, and
  a model-supplied fact/hypothesis label on WHY YOU,
- deep enrichment via company-context, identity resolution, mutual-value, and
  evidence chain stages with per-stage AI-run latency tracking,
- opt-in company web research (`AI_COMPANY_WEB_SEARCH=on`) that grounds company
  context in public pages and records them as `official_company` /
  `public_web` Evidence with openable source URLs,
- an Interaction layer with conversation notes, next-action capture,
  acceptance tracking, and completion recorded as outcome data,
- relationship history: earlier scans of the same resolved person, surfaced as
  an "Nth meeting" badge and a list of past encounters with their notes,
- scan history listing with status badges, a mobile history screen, and a
  star that keeps the meeting worth returning to out of chronological order,
- evidence-view source opening, restricted to `http`/`https` links,
- event analytics via the PostHog HTTP Capture API with 20 named events
  covering activation, scan funnel, value, and trust categories, including
  Flash Brief usefulness rating, `SAY THIS` adoption, wrong-person reporting,
  and unhelpful-hypothesis reporting,
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
interaction logging (notes and next actions), scan history listing, and
evidence source opening.

ML-019 gives the "fact" side of the brief a source outside the card. With
`AI_COMPANY_WEB_SEARCH=on`, the Company Context stage reads public pages about
the company through the provider's search tool and returns them in `sources`;
the evidence sweep turns each into an Evidence row whose `source_url` the app
can open. Until then `official_company` and `public_web` were declared source
types that nothing ever wrote, so every claim traced back to the card or to an
inference.

The stage researches the **company only**. Its input carries the company name,
department and title and deliberately not the person's name, so a page about a
same-named individual cannot be read and presented as fact — the hard rule in
product spec 5.5. Sources that are not `http`/`https` are dropped rather than
stored, and a page whose host matches the card's website or email domain is
filed as `official_company` while everything else is `public_web`.

Research is off by default: it bills per scan and is the only stage that
reaches outside the configured provider. Setting it together with
`AI_PROVIDER_BASE_URL` is a startup error — a deployment that pointed the
stages at its own server has not agreed to a hosted search tool.

ML-018 also completes the Flash Brief contract against product spec 6.2.
`potential_score` (integer 1-5), `connection_keywords` (up to four short
overlap labels) and `why_you_claim_type` (`fact` or `hypothesis`) are now part
of the AI's structured output. The screen used to hardcode a "hypothesis"
badge and had no score at all, so the product's Fact / Hypothesis separation
was cosmetic on the first screen the user reads.

The score is an explainable heuristic about how much grounded common ground the
POTENTIAL sentences rest on, not a rating of the person. The prompt ties each
level to the evidence required for it, and the eval harness asserts the range.

All three fields default for briefs stored before ML-018 (no score, no
keywords, the hypothesis label the screen used to hardcode), so existing scans
keep rendering.

ML-022 lets a finished scan be analysed again under a different meeting goal
(`PATCH /v1/scans/:scanId/reanalysis`). The goal feeds the Flash Brief and
Mutual Value prompts, so a scan captured as networking that turned into a
sales conversation carried a brief written for the wrong situation with no way
to correct it. `restart_scan_analysis` clears only those two analyses and puts
the scan back at `card_ready`; the card, the company context (derived from the
card, not the goal), the note and the next actions are kept, and the pipeline
is scheduled the same way a resume schedules it. A scan that is mid-pipeline
is refused rather than raced.

ML-018 closes the loop from a meeting back to the next one:

```text
GET   /v1/scans/:scanId/encounters
GET   /v1/scans/:scanId/next-action
PATCH /v1/scans/:scanId/next-action
```

`encounters` lists earlier scans whose card resolved to the same `people` row,
newest first, each with a one-line excerpt of that meeting's note. Identity
resolution already reuses a person across scans, so this is a read over
recorded data: a card that resolved to no person returns an empty list rather
than guessing by name.

`GET /v1/scans/:scanId/note` returns the note already saved for a scan
(`note_text` is `null` when there is none). `POST` upserts, so the note screen
reads this first and opens with the stored text; it used to open empty, and
saving on a later visit silently replaced the earlier note. The note screen is
available as soon as the Flash Brief exists and no longer waits for Mutual
Value, so a scan whose analysis failed can still have its conversation
recorded. The AI's Next Action is an explicit choice (実行する / 今回は見送る /
no choice); a scan that already has an action on record is not offered the
suggestion again.

`PATCH /v1/scans/:scanId/next-action` settles an action through the
`update_next_action_status` function (`accepted`, `dismissed` or `completed`).
`next_actions.status` always allowed `completed`, but nothing could write it,
so an accepted action could never be shown as done and no outcome data
accumulated. Moving back to `suggested` is rejected, and an action belonging to
another user is reported as not found.

ML-015 adds event analytics via the PostHog HTTP Capture API. Set
`EXPO_PUBLIC_POSTHOG_API_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` in the mobile
environment to enable tracking; the client is a no-op when the key is absent.

Every name in `analyticsEventNames` is emitted by the app. Three groups need
more than a single call site:

| Group                | Events                                                                                                                     | Where                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Activation, per user | `signup_completed`, `first_scan_started`, `first_brief_viewed`                                                             | `lib/funnel-events.ts`, deduplicated by an AsyncStorage marker per user |
| Funnel, per scan     | `card_extraction_success`, `brief_ready`                                                                                   | the status poll, on the transition this client observed                 |
| Value and trust      | `brief_usefulness_rated`, `say_this_used_yes/no`, `identity_flagged_wrong`, `hypothesis_marked_unhelpful`, `source_opened` | Flash Brief feedback controls, the note screen, and the evidence view   |

`signup_completed` has no dedicated client signal, because email OTP sign-up
and sign-in are the same flow. It fires on the first session an install sees
for a user whose account was created within the last 24 hours, so an existing
user signing in on a new device is not counted as a sign-up. A reinstall can
re-emit an activation event; count unique users, not raw events.

`brief_usefulness_rated` carries a `rating` property of 1–5, and
`say_this_used_yes` / `say_this_used_no` supply the pilot North Star
(Conversation Adoption Rate). The adoption question is asked on the note screen,
after the conversation, about the Flash Brief's `SAY THIS` questions.

The per-scan value and trust events (`brief_usefulness_rated`,
`say_this_used_*`, `conversation_note_saved`, `next_action_*`,
`identity_flagged_wrong`, `hypothesis_marked_unhelpful`) carry a `scan_id`
property. A user can answer again on a later visit, so count these once per
scan rather than per event.

ML-016 adds:

```text
DELETE /v1/scans/:scanId
DELETE /v1/account
```

`DELETE /v1/scans/:scanId` removes the scan, its storage files, and all child
DB rows (via cascade) and returns 204. The person and organization records the
scan's card created are removed too once no other card refers to them. `DELETE /v1/account` deletes all user
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

`.github/workflows/cleanup-expired-scans.yml` calls it hourly. The job is
skipped until the repository variable `CLEANUP_ENDPOINT_URL` (the deployed
endpoint) and the repository secret `CLEANUP_SECRET` are set, and fails loudly
on a non-2xx response.

Scans whose pipeline stopped can be continued:

```text
POST /v1/scans/:scanId/resume
```

The pipeline runs inside the upload request, so a failed Flash Brief (the scan
rolls back to `card_ready`), a failed Mutual Value (back to `brief_ready`) or a
worker cut off mid-stage used to leave the scan with nothing to advance it.
This route re-runs whatever stages are left, under the caller's session. It is
idempotent: `202 {resume: "running"}` when a stage is still live, `200
{resume: "complete"}` when nothing is left, `202 {resume: "scheduled"}`
otherwise. A dead company-context or Mutual Value run is released first,
because their claims cannot recover one. It refuses a scan whose extraction
failed (`409`; re-upload instead) and a scan whose awaited stage has already
failed three times (`429 retry_limit_reached`). The mobile client calls it when
a scan holds `card_ready` or `brief_ready` for 15 seconds, from every "check
again" action, and from **Flash Briefを作成** on a `card_ready` card.

## Verify against the real provider

Every AI test injects a fake request function, so the code path that actually
calls OpenAI never runs in CI. `docs/live-provider-smoke.md` is the runbook for
exercising it: the card-field eval (no Docker needed), then one real scan of a
synthetic card through the whole pipeline, then the same scan with company web
research on. It lists what to read afterwards — schema acceptance, per-stage
`ai_runs` latency against the budgets in `packages/ai/src/provider-client.ts`,
and the evidence rows.

Reasoning depth is configured per stage (`AI_*_EFFORT`: none, low, medium,
high, xhigh, max). Blank omits the parameter, which is what a non-reasoning
model or a self-hosted server needs. `minimal` is rejected at startup because
the GPT-5.6 models answer it with a 400, which the stages would otherwise
report as a provider outage and retry.

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
