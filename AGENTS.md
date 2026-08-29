# AGENTS.md — Miraio Lens

## Product

Miraio Lens is a First-Meeting Relationship Intelligence product.

The MVP optimizes:

```text
business-card scan
→ context
→ personalized Flash Brief
→ Mutual Value
→ Next Action
```

The product is not a generic CRM or digital business-card replacement.

## Source of truth

Before implementing product behavior, read the relevant docs:

- Product spec: `docs/product-specs/miraio-lens-mvp-v0.1.md`
- Architecture: `ARCHITECTURE.md`
- ADRs: `docs/adr/`
- Active execution plans: `docs/exec-plans/active/`

If a ticket conflicts with the product spec, stop and report the conflict rather than silently changing product behavior.

## Architecture

Architecture style:

> Modular Monolith + Asynchronous AI Pipeline

Preserve package boundaries:

- `apps/mobile`: mobile UI/delivery
- `apps/api`: API/BFF/server orchestration
- `packages/domain`: model-independent business concepts
- `packages/ai`: AI provider/orchestration adapters
- `packages/db`: persistence adapters
- `packages/shared`: genuinely generic utilities
- `packages/ui-tokens`: small visual token layer
- `packages/test-fixtures`: deterministic non-PII fixtures
- `evals/`: AI evaluation assets

Do not put provider SDK logic in `packages/domain`.

Do not put secrets or privileged server logic in the mobile app.

## Domain rules

Long-term core concepts include:

- Personal Context
- Card Intelligence
- Identity Status
- Target Context
- Evidence
- Flash Brief
- Mutual Value
- Next Action

Canonical domain types should not depend on:
- React,
- Expo,
- Next.js,
- OpenAI SDK,
- Anthropic SDK,
- Supabase SDK.

## AI rules

Never design the product as:

```text
image → giant prompt → final answer
```

Future AI work should remain staged and schema-driven.

Do not hard-code domain behavior to one model ID/provider.

Fact, hypothesis, and uncertainty must remain distinguishable.

## Scope discipline

Implement the active ticket only.

Do not add “helpful” future features without ticket scope.

If you find needed follow-up work, report it under `Risks / follow-ups`.

## Quality commands

Before completing a task, run the strongest applicable validation:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Prefer:

```bash
pnpm check
```

when available.

Do not claim a check passed unless it was actually run successfully.

## Security

Never commit:
- API keys,
- Supabase service-role keys,
- user PII,
- raw real business-card data,
- credentials.

Use `.env.example` for variable names only.

## Testing

Prefer deterministic tests.

AI behavior will later have a dedicated Golden Dataset under `evals/`.

Do not use real personal/business-card data as fixtures.

## Change style

- Keep changes scoped.
- Prefer small modules.
- Avoid premature abstractions.
- Avoid microservices for MVP.
- Avoid unnecessary dependencies.
- Preserve strict TypeScript.
- Explain meaningful architecture deviations.

## Required completion report

For implementation tasks, report:

1. Summary
2. Repository structure
3. Commands run
4. Validation
5. Deviations
6. Risks / follow-ups
7. Files changed
