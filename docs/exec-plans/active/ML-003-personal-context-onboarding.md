# ML-003 Personal Context Onboarding — detailed implementation ticket

- Ticket: ML-003
- Priority: P0
- Sprint: Sprint 1 / Walking Skeleton
- Status: Implementation complete; native-device and live-provider acceptance
  pending
- Depends on: ML-001, ML-002
- Product source: MVP v0.1 sections 0.3, 2.1, US-001, 4.1–4.3, 5.4,
  5.8, 7–10, 12–13, 16–19

## Outcome

An authenticated user can create a useful private Personal Context in under
three minutes, review AI-produced structured suggestions, edit or remove those
suggestions, explicitly approve them, and later manage the approved items from
the My Context area.

No AI-suggested item may be used by downstream relationship reasoning before
the user approves it.

## Product rationale

Miraio Lens differentiates itself by finding the relevance between a newly met
person and the user, rather than only summarizing the other person. Personal
Context is therefore first-class product data and a prerequisite for the
Sprint 1 scan-to-Flash-Brief flow.

This ticket validates product hypothesis H6: users will store Personal Context
when its value is clear and the setup cost is low.

## User story

> As a user, I want Miraio Lens to understand my professional context.

## Implementation prerequisites

These choices are not locked by the MVP v0.1 product specification. Resolve
and record them before implementation begins; do not silently choose them in
domain code.

1. **Authentication entry method** — ML-002 provides Supabase Auth and session
   persistence but no sign-in UI. Decide whether the private pilot uses email
   OTP/magic link, email/password, or another Supabase-supported method. This
   ticket owns session gating and post-auth onboarding routing; it does not
   invent a second auth system.
2. **Initial AI provider and model alias** — choose one server-side provider
   capable of schema-constrained structured output. Provider and model IDs must
   be runtime configuration. Canonical contracts and business rules must remain
   provider-independent. The existing `OPENAI_API_KEY` placeholder is not, by
   itself, a locked provider decision.

Recommended defaults if the product/technical owner does not make another
choice:

- email OTP for the private pilot,
- one server-side structured-output adapter behind a provider-neutral
  `PersonalContextStructurer` interface,
- a server-only `AI_PERSONAL_CONTEXT_MODEL` model alias/configuration value.

## In scope

### Mobile onboarding

- Session gate: unauthenticated users go to the chosen auth entry; authenticated
  users without usable approved context go to onboarding.
- A Japanese-first onboarding form targeting completion in under three minutes.
- Inputs for:
  - current company,
  - current role / current work,
  - past experience,
  - expertise,
  - strong skills,
  - current themes,
  - what the user can offer,
  - what the user wants to learn, find, or who they want to meet,
  - optional free text.
- Loading, retryable error, validation error, offline/unreachable API, and
  expired-session states.
- A review screen grouping AI suggestions by context type.
- Edit, delete, and explicit approval before the suggestions become usable.
- A My Context screen for viewing, editing, and deleting approved items.
- Clear private-data copy; never imply that Personal Context is public.

### Domain contracts

Add provider- and framework-independent Personal Context concepts under
`packages/domain`.

Canonical item types:

```ts
type PersonalContextType =
  | "past_experience"
  | "expertise"
  | "strong_skill"
  | "current_theme"
  | "offer"
  | "seeking"
  | "free_text";
```

`current_company` and `current_role` remain canonical profile fields. They are
facts entered directly by the user and must not be silently replaced by an AI
rewrite. Later Personal Context retrieval combines these profile facts with
approved context items and always includes current role plus at least one
approved `offer` item when available.

Required domain shapes:

- `PersonalContextOnboardingInput`
- `PersonalContextSuggestion`
- `PersonalContextItem`
- `PersonalContextProfile`
- validation/result errors that do not depend on HTTP, React, Supabase, or an
  AI SDK

Rules:

- Trim user input and reject whitespace-only values.
- Current role/current work and what the user can offer are required for a
  usable context; current company may be absent for independent users.
- An AI suggestion has `source_type = "ai_suggested"` and
  `user_approved = false` when created.
- A user-authored replacement item has `source_type = "user_entered"`.
- Allowed item types are closed in domain validation and database constraints.
- Tags are optional supporting metadata, not hidden facts.
- UI labels can be Japanese; stored type values and API enums stay
  language-neutral.

### AI structuring

Define a provider-neutral application boundary similar to:

```ts
interface PersonalContextStructurer {
  structure(
    input: PersonalContextOnboardingInput,
    options: { locale: "ja" | string },
  ): Promise<PersonalContextStructuredOutput>;
}
```

The concrete provider adapter belongs in `packages/ai`; provider SDK code must
not enter `packages/domain`, `apps/mobile`, or persistence modules.

The structuring stage must:

- preserve the user's meaning and language,
- split broad input into concise, atomic, reusable context items,
- use only the canonical item types,
- keep past experience, expertise, skills, current themes, offers, and seeking
  goals distinguishable,
- avoid duplicate or near-duplicate items,
- never invent employers, roles, achievements, skills, preferences, or goals,
- never infer sensitive traits,
- return schema-valid structured output or a typed failure,
- produce suggestions only; never approve them.

Raw onboarding text must not be included in normal logs. The implementation
must not persist full raw prompt payloads merely for debugging. If model
metadata is recorded, store only operational metadata needed for support and
cost/latency analysis, never provider secrets or raw Personal Context.

### API / BFF

Implement the product-spec routes as authenticated server endpoints. Public
contract paths are `/v1/...`; hosting configuration may determine the origin
but must not rename the versioned resource paths.

All routes must derive the owner from the verified Supabase session. They must
not accept a caller-supplied `user_id` and must not use a mobile-visible
service-role credential.

#### `POST /v1/context/onboarding`

Creates structured, unapproved suggestions.

Representative request:

```json
{
  "profile": {
    "current_company": "Example Company",
    "current_role": "Product Lead"
  },
  "answers": {
    "past_experience": "B2B SaaS product discovery",
    "expertise": "Customer interviews and validation",
    "strong_skills": "Turning ambiguity into testable plans",
    "current_themes": "Responsible use of generative AI",
    "offer": "Structured feedback on early product concepts",
    "seeking": "People running real AI pilots",
    "free_text": ""
  },
  "locale": "ja"
}
```

Representative `201` response:

```json
{
  "profile": {
    "current_company": "Example Company",
    "current_role": "Product Lead"
  },
  "suggestions": [
    {
      "id": "uuid",
      "type": "offer",
      "text": "Structured feedback on early product concepts",
      "tags": ["product-validation"],
      "source_type": "ai_suggested",
      "user_approved": false
    }
  ]
}
```

Behavior:

- Validate the request before calling the AI provider.
- Treat directly entered profile fields as user-authored facts.
- Validate provider output against the canonical runtime schema before any
  persistence.
- Persist profile updates and suggestion rows only after valid structured
  output is available.
- Do not return or persist partial model output after schema failure.
- Avoid duplicate suggestions when the same accepted response is retried. Use
  a client-generated request identifier or an equivalent durable idempotency
  mechanism if the implementation performs more than one persistence write.
- Return typed, non-sensitive errors. A provider failure is retryable and must
  not be presented as successful onboarding.

#### `GET /v1/context`

- Returns the authenticated user's profile context and approved Personal
  Context items.
- Default behavior excludes `user_approved = false` rows so downstream callers
  cannot accidentally use drafts.
- Return a stable empty result for a new user, not `404`.
- Sort deterministically by type and creation/order metadata.

Representative `200` response:

```json
{
  "profile": {
    "current_company": "Example Company",
    "current_role": "Product Lead"
  },
  "items": []
}
```

The onboarding POST response is the primary review payload. If resumable draft
review is added, it must use an explicit owner-only draft query rather than
changing the approved-only default of this endpoint.

#### `PATCH /v1/context/:itemId`

Accepted mutable fields:

```json
{
  "type": "offer",
  "text": "Updated user-reviewed text",
  "tags": ["validation"],
  "user_approved": true
}
```

Rules:

- Partial updates are allowed.
- Ownership, ID, source type, and timestamps are not caller-mutable.
- Editing a draft does not implicitly approve it; approval requires the
  explicit `user_approved: true` action.
- Editing an already approved item keeps it approved unless the request
  explicitly changes approval state.
- Return `404` for a missing or non-owned item to avoid disclosing another
  user's record.

#### `DELETE /v1/context/:itemId`

- Permanently deletes one owned Personal Context item.
- Return `204` on success.
- Deleting an unknown or non-owned item must not reveal cross-user existence.
- The deleted item must disappear from all subsequent approved-context reads.

### Persistence

Use the existing ML-002 tables and RLS foundation. Add a new replayable
migration only for schema constraints or fields that ML-003 actually requires.

Expected mapping:

- `profiles.current_company` ← direct user input
- `profiles.current_role` ← direct user input
- `personal_context_items.type` ← canonical `PersonalContextType`
- `personal_context_items.text` ← reviewed or suggested atomic statement
- `personal_context_items.tags` ← optional normalized tags
- `personal_context_items.source_type` ← `user_entered | ai_suggested`
- `personal_context_items.user_approved` ← explicit approval state

Database requirements:

- Add and test a check constraint for the canonical item types.
- Preserve the existing 1–4000 character database guard.
- Preserve user-scoped RLS and anonymous-role revocation.
- Ensure all server persistence derives ownership from the authenticated
  identity, not an untrusted request field.
- If a database function is introduced for atomic persistence, derive the user
  with `auth.uid()`, set a safe `search_path`, grant only the minimum execution
  privilege, and cover it with pgTAP tests.
- Regenerate `packages/db/src/database.types.ts` after migration changes.

### Application and adapter boundaries

Expected ownership:

```text
apps/mobile
  onboarding, review, My Context UI, session-aware navigation, API client

apps/api
  auth verification, HTTP validation/mapping, orchestration, error mapping

packages/domain
  Personal Context types, invariants, canonical runtime contracts

packages/ai
  PersonalContextStructurer boundary, prompt/schema mapping, provider adapter

packages/db
  user-scoped profile/context repositories and generated database types
```

Do not place AI prompts or provider SDK code in a Route Handler if it can live
behind the `packages/ai` boundary. Do not make mobile write AI suggestions
directly to Supabase. Direct RLS access may be used for ordinary owner-scoped
reads only if it does not bypass the API behavior and approval rules specified
above.

## UX requirements

### Form step

Use the product-spec prompt intent and Japanese-first copy:

1. 今の仕事
2. 得意なこと
3. 最近取り組んでいること
4. 人に提供できること
5. 今知りたい / 会いたい人
6. AIに自分を説明するなら（自由入力）

The UI may combine or progressively reveal fields to remain under the
three-minute target, but it must retain distinct company/role data and all
US-001 input categories. Do not require free text.

### Review step

- Explain that suggestions are private and will not be used until approved.
- Show a human-readable category for every item.
- Let the user edit text/type/tags where tags are exposed.
- Let the user delete unwanted suggestions.
- Provide one clear approval/continue action.
- Do not use prechecked consent or silently approve on navigation.
- If batch approval partially fails, retain the review state and identify the
  retryable failure; do not claim completion.

### My Context step

- List approved profile context and items in readable groups.
- Support edit and delete with accessible touch targets.
- Empty state routes the user back to onboarding.
- Use labels in addition to color for draft/approved/error meaning.
- Preserve form/review state through normal screen transitions during the
  active session.

## Error and security behavior

- `400`: invalid request or invalid structured output that is attributable to
  request validation.
- `401`: missing, invalid, or expired authenticated session.
- `404`: missing/non-owned item for item routes.
- `409`: duplicate/idempotency conflict only when the same request cannot be
  safely replayed.
- `429`: upstream or application rate limit; provide retry guidance.
- `502` or `503`: retryable AI/provider failure without leaking provider text.
- `500`: unexpected server failure with a correlation ID but no Personal
  Context in logs.

Never log authorization headers, raw form answers, AI prompts/responses,
profile text, context item text, or provider secrets in standard request logs.
Do not infer or generate sensitive traits or personality claims.

## Out of scope

- Business-card camera, upload, OCR, or scan records (ML-004/ML-005).
- Using Personal Context to create Flash Briefs (ML-006/ML-007).
- Semantic embeddings, similarity ranking, or top-5–10 retrieval behavior.
- Company/person public-web enrichment and identity resolution.
- Mutual Value, evidence UI, notes, and Next Actions.
- Golden Dataset/eval harness and product analytics dashboards.
- Account-level deletion; individual context-item deletion is in scope.
- A broad design system or navigation unrelated to onboarding/My Context.
- Multiple production AI providers or automatic provider failover.
- Persisting raw onboarding prompts for future unspecified use.

## Implementation sequence

1. Resolve and document the auth-entry and initial-AI-adapter prerequisites.
2. Add canonical Personal Context contracts, validation, and domain tests.
3. Add the schema constraint migration, RLS/approval database tests, and
   regenerated database types.
4. Add user-scoped persistence adapters.
5. Add the provider-neutral structurer and one configured server adapter, with
   a deterministic fake used only in tests.
6. Implement authenticated API orchestration and route tests.
7. Implement mobile session gating, form, review, approval, and My Context
   management.
8. Add integration tests using two users to prove isolation and approval
   filtering.
9. Validate the native/device flow and time the happy-path onboarding.
10. Update README/environment documentation and run all quality gates.

## Test plan

### Domain unit tests

- Every canonical type is accepted; unknown types are rejected.
- Required current-role/current-work and offer input is enforced.
- Whitespace-only and over-limit values are rejected.
- Provider output cannot mark suggestions approved.
- Provider output with invented/unknown fields or invalid enums fails closed.

### AI adapter/orchestration tests

- Deterministic fake output maps into canonical suggestions.
- Invalid provider output is rejected before persistence.
- Provider timeout/rate-limit/schema errors map to typed retryable failures.
- No production path falls back to fabricated hard-coded suggestions.
- Provider and model IDs are configuration, not domain constants.

### API tests

- Unauthenticated requests return `401`.
- Valid onboarding returns unapproved AI suggestions.
- Invalid input does not call the provider or write data.
- `GET /v1/context` excludes unapproved suggestions.
- Owner can edit, approve, and delete an item.
- Non-owner cannot read, modify, approve, or delete another user's item.
- Unknown/non-owned item behavior does not leak existence.
- Retry behavior does not create duplicate accepted suggestions.

### Database tests

- Type check constraint rejects unknown context types.
- Source and approval values persist as expected.
- RLS isolates profile and Personal Context rows between two authenticated
  users for select/insert/update/delete.
- Anonymous role has no access.
- Approved-only repository query excludes drafts.

### Mobile tests

- Session state selects auth entry, onboarding, or My Context correctly.
- Form validation and Japanese labels render correctly.
- Submit loading prevents accidental duplicate requests.
- Review edit/delete/approve behavior preserves explicit consent.
- API/session/provider failures present a recoverable action.
- Empty approved context can restart onboarding.

### Manual acceptance

On a physical device or native simulator:

1. Sign in with the pilot auth method.
2. Complete the form in Japanese.
3. Confirm AI suggestions are shown as unapproved.
4. Edit one item, delete one item, and approve the rest.
5. Open My Context and verify only approved items appear.
6. Restart the app and verify the authenticated approved context reloads.
7. Edit and delete an approved item.
8. Confirm another test user cannot observe any of the first user's data.
9. Record the happy-path completion time; target is under three minutes.

Use deterministic, non-PII `.invalid` identities and fictional professional
content for fixtures. Do not use real Personal Context in tests or screenshots.

## Acceptance criteria

- [x] An authenticated user can enter every US-001 context category.
- [ ] The happy path is usable in under three minutes on a physical device or
      native simulator.
- [ ] A real server-side AI adapter returns schema-valid structured suggestions;
      the production path is not mocked.
- [x] AI suggestions are persisted as `ai_suggested` and unapproved.
- [x] No unapproved item is returned by the approved-context query or made
      available to downstream reasoning.
- [x] The user can edit, delete, and explicitly approve suggestions.
- [x] The user can later view, edit, and delete approved context.
- [x] Current company/current role are preserved as direct user-entered profile
      facts.
- [x] Personal Context is private, user-scoped, and protected by RLS.
- [x] Cross-user API and database isolation tests pass.
- [x] AI/provider secrets are server-only and no raw Personal Context is logged.
- [x] AI output validation fails closed and retryable failures have a recovery
      action.
- [x] Japanese-first UI is accessible and stored enums remain language-neutral.
- [x] Schema types are regenerated and deterministic tests use no PII.
- [x] README and `.env.example` document only the configuration names needed by
      the chosen auth and AI adapter.
- [x] `pnpm format:check`, database validation, and `pnpm check` pass.

## Implementation evidence — 2026-08-17

- The prerequisite decisions are recorded in ADR-0003: six-digit Supabase
  email OTP and an OpenAI Responses structured-output adapter behind the
  provider-neutral `PersonalContextStructurer` boundary. The model ID is read
  from the server-only `AI_PERSONAL_CONTEXT_MODEL` setting.
- Domain, AI, API, and mobile tests pass with 36 TypeScript assertions in
  total. The API tests cover authentication, approved-only reads, ownership
  masking, invalid input, provider failures, approval, and deletion.
- Three pgTAP files pass 51 assertions covering canonical types, atomic
  onboarding persistence, idempotent replay, anonymous-role revocation,
  approval filtering, and two-user RLS isolation.
- A local runtime smoke test completed email OTP issuance and verification,
  returned `401` without a bearer token, returned `200` with an authenticated
  empty Personal Context, and returned the sanitized `ai_unconfigured` `503`
  when the server-only provider key was intentionally absent.
- Regenerating `packages/db/src/database.types.ts` produced the same SHA-256
  digest before and after generation.
- `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm db:lint`,
  `pnpm db:test`, and `pnpm check` pass.
- The plan remains active because a physical-device/simulator timing run and a
  live OpenAI smoke test require external runtime inputs that are not present
  in this workspace. No mock is wired into the production path.

## Validation commands

Run the strongest applicable checks from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm supabase:start
pnpm db:reset
pnpm db:lint
pnpm db:test
pnpm db:types
pnpm format:check
pnpm check
pnpm dev:api
pnpm dev:mobile
```

Also verify that regenerating database types leaves no unexplained diff. A real
provider smoke test is manual/opt-in and requires a local server-only key; CI
must use an injected deterministic fake and must never require a secret.

## Definition of done

- Every acceptance criterion above is satisfied or an explicit product-owner
  deviation is recorded.
- Product-spec behavior and package boundaries are preserved.
- The device/simulator flow and user-isolation integration tests pass.
- No mocked suggestion is used in the production demo path.
- No credentials, real PII, raw prompts, or AI responses are committed.
- Documentation covers local setup, configuration, run, test, and manual smoke
  validation.
- This plan is updated with completion evidence and moved from `active/` to
  `completed/` only after all required work passes.

## Required implementation report

The implementer must finish with the repository-standard report:

1. Summary
2. Repository structure
3. Commands run
4. Validation
5. Deviations
6. Risks / follow-ups
7. Files changed

Under Deviations, explicitly record the chosen auth method, AI provider adapter,
configured model alias strategy, and any product-spec or schema differences.
