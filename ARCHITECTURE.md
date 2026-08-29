# Miraio Lens Architecture

## Architecture style

Miraio Lens uses a **Modular Monolith + Asynchronous AI Pipeline** for MVP
v0.1. The mobile client and API are separate delivery layers in one monorepo;
business meaning remains portable and vendor-neutral.

Microservices are intentionally out of scope until scaling or ownership needs
justify the operational cost.

## Dependency direction

Application code follows this direction:

```text
apps/mobile ───────┐
                   ├──> application/orchestration ──> domain contracts
apps/api ──────────┘

AI / DB / external adapters ──> implement or consume domain contracts
```

Forbidden dependency directions:

```text
domain → React / Next.js / Expo
domain → OpenAI SDK / Anthropic SDK
domain → Supabase SDK
domain → HTTP or persistence implementations
```

Delivery layers may compose package modules, but must not absorb all domain
logic. Provider and persistence packages are adapters around product concepts,
not the source of those concepts.

## Repository map

- `apps/mobile`: React Native / Expo delivery layer.
- `apps/api`: Next.js Route Handler API/BFF and server orchestration layer.
- `packages/domain`: framework- and provider-independent business concepts.
- `packages/ai`: AI provider adapters, schemas, and orchestration boundaries.
- `packages/db`: persistence adapters and database mapping.
- `packages/shared`: genuinely generic cross-cutting utilities only.
- `packages/ui-tokens`: small visual token layer shared by UI delivery code.
- `packages/test-fixtures`: deterministic, non-PII fixtures.
- `evals`: AI golden datasets and scoring assets, separate from unit tests.
- `supabase`: local configuration, migrations, RLS tests, and seed data.
- `docs`: product, architecture, ADR, and execution-plan source of truth.

## Asynchronous AI pipeline

Later tickets will implement staged processing rather than a single giant
prompt:

```text
Card Intelligence
  → Target Context
  → Identity Resolution
  → Personal Context Retrieval
  → Relationship Reasoning
  → Evidence / Uncertainty Validation
  → Flash Brief
  → asynchronous deep enrichment
```

ML-003 implements the first isolated AI stage: Personal Context structuring.
The API composes a provider-neutral `PersonalContextStructurer`, while the
initial OpenAI Responses adapter and strict structured-output mapping remain in
`packages/ai`. Later card and relationship stages must follow the same boundary.

ML-004 establishes the capture-to-Card-Intelligence handoff. The mobile client
generates a stable scan UUID, captures one front-side JPEG with Expo Camera,
and sends binary bytes to the authenticated BFF. The API validates the portable
scan contract, reserves the user-scoped scan, uploads through a user-scoped
Supabase client, and advances only a successful private upload to
`extracting_card`. OCR and all interpretation remain in later AI stages.

ML-005 implements Card Intelligence as its own provider-neutral stage. A
Next.js response-after callback claims one owner-scoped extraction run, reads
the private object with the same user session, and invokes a schema-constrained
image extractor in `packages/ai`. One security-invoker database function
atomically persists the canonical nullable card, business-card Evidence,
`card_ready` transition, and sanitized AI-run latency. User corrections are a
separate atomic path that preserves the original extraction JSON and records
`user_correction` provenance. Company enrichment, identity resolution, and
relationship inference cannot enter this stage.

## Model-agnostic principle

Canonical domain contracts represent product meaning. Model IDs and provider
selection belong in configuration and AI adapters. The future Relationship
Engine must consume and produce canonical contracts rather than depend on one
provider's response shape.

Facts, hypotheses, asks, evidence, and uncertainty must remain distinguishable
through the pipeline.

## Security boundary

Public `EXPO_PUBLIC_*` configuration may be embedded in the mobile bundle.
Service-role keys, provider credentials, privileged database access, and job
signing secrets are server-only. Neither raw user PII nor credentials belong in
fixtures, source control, or normal logs.

All exposed user-owned tables use Supabase Auth identity through PostgreSQL Row
Level Security. Scan child rows also carry `user_id` in composite foreign keys,
so relational integrity cannot associate one user's child data with another
user's scan. Business-card images live in a private bucket under user-ID path
prefixes. Personal Context onboarding is persisted by a security-invoker
database function that derives ownership from `auth.uid()`; AI suggestions are
unapproved by default and normal context reads explicitly filter for approval.
Card capture uses no service-role credential: the API verifies the Bearer
session and performs scan and Storage writes under that same user identity.
Raw-image paths contain only authenticated user ID, scan UUID, and a fixed
front-side filename. Each reservation records one-hour expiry metadata. ML-005
attempts immediate user-scoped object deletion after successful extraction,
clears the path only after deletion succeeds, and makes any retained path
immediately expired. A later privileged cleanup sweep is still required for
objects whose deletion attempt fails or whose worker never reaches completion.

## Decision records

Architecture decisions live in `docs/adr/`. Start with
`ADR-0001-monorepo-and-modular-monolith.md`.
