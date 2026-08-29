# ADR-0001: pnpm monorepo and modular monolith

- Status: Accepted
- Date: 2026-08-17

## Context

Miraio Lens needs a native client, a server-side API/BFF, portable product
contracts, AI and persistence adapters, and a clear path for evaluation. The
MVP team must move quickly while protecting product meaning from framework and
vendor coupling.

The first release does not have separate scaling or ownership requirements
that justify distributed services or independent repositories.

## Decision

Use:

- one pnpm workspace,
- Turborepo for lint, typecheck, test, and build orchestration,
- React Native, Expo, and Expo Router for the mobile delivery layer,
- Next.js Route Handlers for the API/BFF,
- a modular monolith with explicit `domain`, `ai`, `db`, `shared`, `ui-tokens`,
  and `test-fixtures` package boundaries,
- GitHub Actions running the same root quality commands as local development.

Domain contracts remain portable TypeScript. Framework code stays in apps;
provider and persistence SDKs stay in adapters. No microservices are introduced
for the MVP.

## Consequences

Positive consequences:

- one installation and quality gate cover the complete product,
- atomic changes can span mobile, API, and contracts,
- package boundaries make forbidden dependencies visible,
- AI provider changes need not redefine business concepts,
- shared tooling and tests reduce bootstrap overhead.

Trade-offs:

- the repository is larger than either app alone,
- CI may run work unrelated to a small change until caching is warm,
- package discipline relies on review and future boundary checks,
- independent service deployment is deferred.

## Alternatives considered

### Separate repositories

Rejected for the MVP because cross-layer changes would require coordinated
versions, duplicate tooling, and slower feedback before team ownership needs
justify that cost.

### Microservices

Rejected because there is no demonstrated scaling boundary. Distributed
deployment, networking, observability, retries, and data consistency would add
operational risk without improving the first-meeting product hypothesis.

### Single Next.js-only application

Rejected because the core experience is a native mobile scan workflow and
because placing all business and provider logic inside one Next.js app would
weaken portability and package boundaries.
