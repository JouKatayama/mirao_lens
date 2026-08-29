# ML-001 Repository Bootstrap execution plan

- Ticket: ML-001
- Priority: P0
- Status: Complete
- Scope: repository walking skeleton only

## Objective

Create a reproducible pnpm/Turborepo monorepo in which the Expo mobile shell,
Next.js API, and shared TypeScript packages can be installed, checked, built,
and understood by a new developer or coding agent.

## In scope

- root workspace and quality commands,
- Expo Router placeholder screen,
- Next.js `GET /api/health`,
- `domain`, `ai`, `db`, `shared`, `ui-tokens`, and `test-fixtures` packages,
- one canonical `IdentityStatus` contract and smoke test,
- strict TypeScript, ESLint, Prettier, Vitest, and Turborepo,
- GitHub Actions CI,
- documentation, environment contract, and repository hygiene,
- reserved `supabase` and `evals` structure.

## Out of scope

- authentication or Supabase implementation,
- database schemas or migrations,
- card camera, upload, or OCR,
- AI provider calls or prompts,
- Personal Context, identity resolution logic, Flash Brief, or Mutual Value,
- analytics, deployment, or production infrastructure.

## Implementation sequence

1. Inspect all supplied repository documents and check for conflicts.
2. Create root workspace and tooling configuration.
3. Add the mobile and API walking skeletons.
4. Add package boundaries and smoke tests.
5. Add documentation, CI, environment, eval, and persistence placeholders.
6. Install dependencies and commit the lockfile.
7. Run lint, typecheck, tests, build, API health, and Expo start validation.
8. Fix failures and rerun `pnpm check`.

## Acceptance checklist

- [x] pnpm workspace, Turborepo, and root scripts exist.
- [x] Expo Router mobile shell renders the ML-001 placeholder.
- [x] Next.js health Route Handler returns the locked payload.
- [x] All six package boundaries exist and compile scripts are configured.
- [x] Domain smoke test covers canonical identity statuses.
- [x] CI and source-of-truth documentation exist.
- [x] Frozen lockfile install succeeds.
- [x] `pnpm check` succeeds.
- [x] API health responds from a running development server.
- [x] Expo development server starts successfully.

## Validation commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
pnpm dev:api
pnpm dev:mobile
```

If native simulators are unavailable, validate Expo startup, configuration, and
web export and report that limitation.

## Completion validation

- `pnpm install --frozen-lockfile`: passed.
- `pnpm check`: passed across all eight workspace packages.
- API development server: started; `GET /api/health` returned HTTP 200 with the
  expected payload.
- Expo development server: Metro started and served the web entry successfully.
- Native simulator launch was not attempted because local `simctl` is
  unavailable; the Expo web export and live Metro web response both passed.
