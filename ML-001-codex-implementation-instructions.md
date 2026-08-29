# ML-001 — Repository Bootstrap
## Codex Implementation Instructions

**Product:** Miraio Lens  
**Ticket:** ML-001  
**Priority:** P0  
**Sprint:** Sprint 1 — Walking Skeleton  
**Role executing this ticket:** Codex Implementation Agent  
**Upstream owner:** GPT PM / Scrum Master / Tech Lead  
**Human owner:** Product Owner  
**Status:** Ready for implementation

---

# 0. Codex: read this first

You are implementing **ML-001 only**.

The purpose of this ticket is to create a clean, reliable, agent-friendly monorepo foundation for Miraio Lens.

Do **not** implement business features yet.

Do **not** implement:
- authentication,
- Supabase schema,
- business-card OCR,
- OpenAI API calls,
- Personal Context,
- camera capture,
- Flash Brief,
- identity resolution,
- analytics,
- deployment.

Those belong to later tickets.

Your goal is to make the repository ready for ML-002 through ML-007 with clear package boundaries, reproducible commands, CI, documentation, and tests.

---

# 1. Product context

Miraio Lens is a **First-Meeting Relationship Intelligence** product.

The MVP flow will eventually be:

```text
Personal Context
      ↓
Business Card Scan
      ↓
Card Intelligence
      ↓
Target Context
      ×
Personal Context
      ×
Meeting Goal
      ↓
Relationship Intelligence
      ↓
Flash Brief
      ↓
Mutual Value
```

The architecture is intentionally:

> **Modular Monolith + Asynchronous AI Pipeline**

Do not introduce microservices, Kafka, Kubernetes, or distributed infrastructure.

The repository must support future modules for:

- card intelligence,
- identity resolution,
- public/company context,
- Personal Context retrieval,
- relationship reasoning,
- evidence,
- next action,
- AI provider abstraction,
- evaluation.

---

# 2. ML-001 objective

Create a monorepo where:

1. the Expo mobile application starts,
2. the API application starts,
3. shared TypeScript packages compile,
4. lint/typecheck/test/build commands run from the repository root,
5. CI runs the same validation commands,
6. repository documentation tells both humans and Codex how to work,
7. package boundaries are explicit enough that later AI/domain code does not become tangled.

---

# 3. Technical decisions for ML-001

These decisions are **locked for this ticket** unless the current repository already has a conflicting established convention.

## Package manager

Use:

```text
pnpm workspaces
```

Do not use npm/yarn for workspace management.

## Task runner

Use:

```text
Turborepo
```

Use it only for orchestration/caching of:

- lint
- typecheck
- test
- build

Do not add complex remote caching configuration.

## Language

Use:

```text
TypeScript
```

Enable strict TypeScript.

Avoid `any` unless there is a documented boundary reason.

## Mobile

Use:

```text
React Native
Expo
Expo Router
```

For ML-001, only create a minimal running shell.

No camera dependency is required until ML-004 unless Expo bootstrap installs it by default.

## API

Use:

```text
Next.js
Route Handlers
TypeScript
```

For ML-001 create only:

```text
GET /api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "miraio-lens-api"
}
```

No database or AI client.

## Unit tests

Use a lightweight TypeScript test runner compatible with the workspace.

Preferred:

```text
Vitest
```

Do not add heavyweight test infrastructure.

## Formatting / linting

Prefer one consistent repository-wide toolchain.

Recommended:

```text
ESLint + Prettier
```

If the generated Expo/Next templates already provide a stable lint setup, extend that rather than fighting it.

The important result is one root command that succeeds.

## CI

Use:

```text
GitHub Actions
```

CI must run:

1. install with frozen lockfile,
2. lint,
3. typecheck,
4. test,
5. build.

---

# 4. Repository structure

Create the following structure.

```text
miraio-lens/
│
├─ AGENTS.md
├─ ARCHITECTURE.md
├─ README.md
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ .editorconfig
├─ .gitignore
├─ .env.example
│
├─ .github/
│  └─ workflows/
│     └─ ci.yml
│
├─ apps/
│  ├─ mobile/
│  │  ├─ app/
│  │  ├─ assets/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ ...
│  │
│  └─ api/
│     ├─ app/
│     │  └─ api/
│     │     └─ health/
│     │        └─ route.ts
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ ...
│
├─ packages/
│  ├─ domain/
│  │  ├─ src/
│  │  │  └─ index.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  │
│  ├─ ai/
│  │  ├─ src/
│  │  │  ├─ providers/
│  │  │  ├─ schemas/
│  │  │  └─ index.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  │
│  ├─ db/
│  │  ├─ src/
│  │  │  └─ index.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  │
│  ├─ shared/
│  │  ├─ src/
│  │  │  └─ index.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  │
│  ├─ ui-tokens/
│  │  ├─ src/
│  │  │  └─ index.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  │
│  └─ test-fixtures/
│     ├─ src/
│     │  └─ index.ts
│     ├─ package.json
│     └─ tsconfig.json
│
├─ docs/
│  ├─ product-specs/
│  │  ├─ index.md
│  │  └─ miraio-lens-mvp-v0.1.md
│  │
│  ├─ architecture/
│  │  └─ index.md
│  │
│  ├─ adr/
│  │  ├─ index.md
│  │  └─ ADR-0001-monorepo-and-modular-monolith.md
│  │
│  └─ exec-plans/
│     ├─ active/
│     │  └─ ML-001-repository-bootstrap.md
│     └─ completed/
│        └─ .gitkeep
│
├─ supabase/
│  ├─ migrations/
│  │  └─ .gitkeep
│  └─ seed.sql
│
└─ evals/
   ├─ golden-dataset/
   │  └─ README.md
   └─ scoring/
      └─ README.md
```

---

# 5. Why this structure exists

Codex must preserve these boundaries.

## `apps/mobile`

User-facing native/mobile application.

Responsibilities later:
- onboarding,
- scan UI,
- processing UI,
- Flash Brief,
- Mutual Value,
- history,
- notes.

Must not contain:
- OpenAI secret/API calls,
- privileged database credentials,
- core relationship reasoning.

---

## `apps/api`

Server-side entry point / BFF.

Responsibilities later:
- authenticated API,
- scan orchestration,
- server-only provider calls,
- job dispatch,
- authorization.

Must not become the home for all domain logic.

Call package modules instead.

---

## `packages/domain`

**Most important architectural package.**

Contains model-independent business concepts.

Future examples:

```text
CardExtraction
IdentityStatus
TargetContext
PersonalContextItem
FlashBrief
MutualValue
Evidence
NextAction
```

Rules:

- no React,
- no Next.js,
- no Expo,
- no OpenAI SDK,
- no Supabase client,
- no HTTP implementation details.

This package should be portable TypeScript.

---

## `packages/ai`

AI-specific orchestration boundaries.

Future layout:

```text
providers/
  openai/
  anthropic/
schemas/
prompts/
evaluators/
```

Rules:

- domain code must not depend directly on a model ID,
- model/provider selection must be configurable,
- all model outputs must eventually map into canonical domain schemas.

ML-001 should create only safe placeholders/interfaces if needed.

Do not implement AI calls.

---

## `packages/db`

Persistence adapters.

Future responsibility:
- Supabase/Postgres repositories,
- DB mapping,
- persistence interfaces/adapters.

No database implementation is required in ML-001.

---

## `packages/shared`

Small cross-cutting utilities only.

Do not turn this into a dumping ground.

If code belongs to a business concept, put it in `domain`.

---

## `packages/ui-tokens`

Miraio visual primitives/tokens only.

For future:
- spacing,
- typography constants,
- semantic color tokens,
- radius values.

Do not create a large design system in ML-001.

---

## `packages/test-fixtures`

Shared deterministic fixtures for later:

- business-card samples,
- Personal Context examples,
- canonical AI outputs.

No real personal data.

---

## `docs/`

Treat documentation as the repository source of truth.

`AGENTS.md` should stay concise and act mainly as a map to deeper documentation.

---

## `supabase/`

Reserved for ML-002 onward.

ML-001 only creates the directory, placeholder migration structure, and a harmless seed file/comment.

Do not invent DB schema early.

---

## `evals/`

First-class location for future AI evaluation.

The existence of this directory is intentional.

Miraio Lens is an AI product; evaluation artifacts must not be hidden inside generic tests.

---

# 6. Workspace package naming

Use package scope:

```text
@miraio/*
```

Suggested names:

```text
@miraio/mobile
@miraio/api
@miraio/domain
@miraio/ai
@miraio/db
@miraio/shared
@miraio/ui-tokens
@miraio/test-fixtures
```

All internal packages should be:

```json
{
  "private": true
}
```

unless publishing becomes a deliberate future decision.

---

# 7. Root scripts

Root `package.json` must expose at least:

```json
{
  "scripts": {
    "dev": "turbo run dev --parallel",
    "dev:mobile": "...",
    "dev:api": "...",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "build": "turbo run build",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

Exact commands may differ based on generated app scripts, but these root user-facing commands must exist.

`pnpm check` is the main local quality gate.

---

# 8. Environment contract

Create `.env.example`.

For ML-001 it should declare future keys without requiring real values.

Example:

```bash
# Public mobile config
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# Server-only (future tickets)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=

# Background jobs (future)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Add comments explaining:

- `EXPO_PUBLIC_*` values are exposed to the client,
- service-role/provider secrets are server-only,
- `.env*` real files must be gitignored.

Do not add real credentials.

---

# 9. AGENTS.md requirement

Create a concise root `AGENTS.md`.

Its purpose is to tell Codex:

1. what Miraio Lens is,
2. where source-of-truth docs live,
3. architectural boundaries,
4. commands it must run,
5. ticket discipline,
6. what it must never do.

Use the provided `AGENTS.md` starter as the basis.

Do **not** turn AGENTS.md into a 500-line product spec.

Link to:

```text
docs/product-specs/miraio-lens-mvp-v0.1.md
ARCHITECTURE.md
docs/adr/
docs/exec-plans/
```

---

# 10. Architecture documentation

Create `ARCHITECTURE.md`.

It must document:

## Architecture style

```text
Modular Monolith + Async AI Pipeline
```

## Dependency direction

Target direction:

```text
apps/*
   ↓
application/orchestration
   ↓
domain
```

Infrastructure adapters:

```text
AI / DB / external services
        ↓ implement/use
domain contracts
```

Avoid a design where:

```text
domain → Next.js
domain → Expo
domain → OpenAI SDK
domain → Supabase SDK
```

## Model-agnostic principle

The future Relationship Engine must depend on canonical data contracts, not a specific GPT/Claude model.

---

# 11. ADR-0001

Create:

```text
docs/adr/ADR-0001-monorepo-and-modular-monolith.md
```

Decision:

- pnpm workspace,
- Turborepo,
- Expo mobile,
- Next.js API/BFF,
- modular monolith,
- shared domain packages,
- no microservices for MVP.

Include:

```text
Context
Decision
Consequences
Alternatives considered
```

Alternatives considered should briefly include:

- separate repositories,
- microservices,
- single Next.js-only application.

Explain why they are rejected for MVP.

---

# 12. Product specification placement

If the MVP specification file is available to you, copy it into:

```text
docs/product-specs/miraio-lens-mvp-v0.1.md
```

Do not rewrite product decisions.

If it is not available in the working environment:

1. create `docs/product-specs/index.md`,
2. state that the product spec must be added before ML-002,
3. do not fabricate a replacement specification.

---

# 13. Minimal application behavior

## Mobile

The mobile app only needs a clean placeholder screen.

Show:

```text
Miraio Lens

First-Meeting Relationship Intelligence

Repository bootstrap complete.
```

Optional secondary text:

```text
ML-001
```

Do not build product UI.

## API

Implement:

```text
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "service": "miraio-lens-api"
}
```

Add a unit/integration test for this health behavior if practical in the chosen Next.js setup.

---

# 14. Package smoke tests

Create at least one trivial, meaningful compile/test case in a shared package.

Example:

`packages/domain` may define:

```ts
export type IdentityStatus =
  | "verified"
  | "high_confidence"
  | "medium_confidence"
  | "unresolved";
```

This is allowed because `IdentityStatus` is already a locked domain concept in the MVP specification.

Do **not** implement the rest of the domain model.

Add a test that proves package test wiring works.

Purpose:

> Validate the monorepo testing pipeline, not begin ML-009 early.

---

# 15. TypeScript rules

Base config should enable strong defaults, including:

```text
strict
noUncheckedIndexedAccess
noImplicitOverride
forceConsistentCasingInFileNames
```

Use app-specific extensions where generated frameworks need them.

Do not force settings that break framework-generated code without benefit.

---

# 16. Dependency rules

ML-001 should minimize dependencies.

Add a dependency only if:

1. used by code created in ML-001, or
2. required by core workspace/build tooling.

Do not pre-install:

- OpenAI SDK,
- Anthropic SDK,
- Supabase client,
- Inngest SDK,
- PostHog,
- Sentry,

unless required by a bootstrap template.

Those belong to subsequent tickets.

---

# 17. CI

Create:

```text
.github/workflows/ci.yml
```

Trigger:

```text
pull_request
push to main
```

Steps:

```text
checkout
setup Node
setup pnpm
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use dependency caching supported by setup tooling.

Do not add deployment to CI.

---

# 18. README requirements

README must answer:

1. What is Miraio Lens?
2. What is currently implemented?
3. Repository map.
4. Prerequisites.
5. Install.
6. Run mobile.
7. Run API.
8. Run all checks.
9. Environment setup.
10. Development workflow.
11. Where product/architecture docs live.

Keep it useful to a new developer.

---

# 19. Git / repository hygiene

Create appropriate `.gitignore` for:

- Node,
- Expo,
- Next.js,
- environment files,
- build output,
- local Supabase artifacts where relevant,
- OS/editor temporary files.

Do not ignore:

```text
.env.example
```

Do not commit:
- secrets,
- generated `.next`,
- Expo local build/cache output,
- dependency directories.

---

# 20. Out-of-scope guardrails

If during implementation you notice something “would be useful,” do not silently add it.

Specifically do not add:

- database schema,
- login screen,
- business-card scan flow,
- image upload,
- AI provider clients,
- web-search logic,
- domain scoring,
- mock Flash Brief engine,
- sample user PII,
- production deployment infrastructure.

Record follow-up suggestions in the final implementation report instead.

---

# 21. Tests / validation Codex must run

Before finishing, run the repository equivalent of:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Prefer:

```bash
pnpm check
```

after the individual setup issues are fixed.

Also verify:

```bash
pnpm dev:api
```

starts successfully and `/api/health` works.

Verify the Expo app can start successfully.

If the environment prevents launching the simulator/device, run the strongest available Expo static/prebuild validation and report the limitation explicitly.

---

# 22. Acceptance Criteria

ML-001 is complete only if all are true.

## AC-01 Repository

- pnpm workspace exists.
- lockfile committed.
- Turborepo config exists.
- root scripts exist.

## AC-02 Mobile

- Expo mobile app exists in `apps/mobile`.
- app builds/typechecks.
- minimal placeholder renders.

## AC-03 API

- Next.js API app exists in `apps/api`.
- `/api/health` returns expected payload.

## AC-04 Packages

These package boundaries exist:

```text
domain
ai
db
shared
ui-tokens
test-fixtures
```

All compile.

## AC-05 Quality gate

From root:

```bash
pnpm check
```

passes.

## AC-06 CI

GitHub Actions runs the same quality gates.

## AC-07 Documentation

Exists:

```text
AGENTS.md
ARCHITECTURE.md
README.md
docs/adr/ADR-0001-monorepo-and-modular-monolith.md
docs/exec-plans/active/ML-001-repository-bootstrap.md
```

## AC-08 Security hygiene

- no credentials,
- `.env.example` exists,
- real env files ignored,
- client/server secret boundary documented.

## AC-09 Scope

No ML-002+ feature implementation has been introduced.

---

# 23. Definition of Done

The ticket is done when:

1. a fresh developer can clone the repo,
2. run the documented install command,
3. run `pnpm check`,
4. start the API,
5. start the Expo app,
6. understand where future code belongs,
7. give the repository to Codex and have Codex understand the architecture from `AGENTS.md` + linked docs.

---

# 24. Required Codex final report

At completion, reply with exactly these sections:

## Summary
What was implemented.

## Repository structure
Important directories/files created.

## Commands run
List commands and success/failure.

## Validation
State results for:
- lint,
- typecheck,
- tests,
- build,
- API health,
- Expo start validation.

## Deviations
Any deviation from this ticket and why.

## Risks / follow-ups
Anything ML-002 should know.

## Files changed
Concise list.

Do not claim validation you did not perform.

---

# 25. Codex execution order

Follow this order:

```text
1. Inspect repository
2. Read AGENTS.md if one already exists
3. Preserve existing valid conventions
4. Initialize pnpm workspace
5. Bootstrap apps/mobile
6. Bootstrap apps/api
7. Create packages
8. Configure TypeScript
9. Configure Turborepo
10. Add root scripts
11. Add health endpoint
12. Add smoke test
13. Add docs / ADR / AGENTS.md
14. Add CI
15. Run lint/typecheck/test/build
16. Fix failures
17. Re-run full quality gate
18. Provide implementation report
```

Do not stop after scaffolding if checks fail.

---

# 26. Copy-paste task prompt for Codex

Paste the following into Codex after this document is available in the repository:

> Implement ticket **ML-001 Repository Bootstrap** for Miraio Lens.  
> Read the repository root `AGENTS.md` and `docs/exec-plans/active/ML-001-repository-bootstrap.md` first, then inspect the current repository state before changing anything.  
> Implement only ML-001. Build the pnpm/Turborepo monorepo with Expo mobile, Next.js API/BFF, the specified shared package boundaries, documentation, CI, root quality commands, `/api/health`, and smoke tests.  
> Do not implement ML-002+ product functionality such as Supabase Auth/schema, OpenAI calls, OCR, camera workflow, Personal Context, Flash Brief, or analytics.  
> Run the full validation suite and fix failures.  
> Finish with the required implementation report from the ML-001 ticket.

---

# 27. Architectural rule to preserve in every future ticket

```text
Apps contain delivery/UI.
Domain contains business meaning.
AI contains model/provider integration.
DB contains persistence integration.
External vendors are adapters, not the product architecture.
```

For Miraio Lens, the long-term moat is:

```text
Personal Context
Relationship Context
Identity/Evidence
Relationship History
Outcome Data
```

—not framework-specific code and not a single LLM provider.

ML-001 must create a repository that protects that distinction from day one.
