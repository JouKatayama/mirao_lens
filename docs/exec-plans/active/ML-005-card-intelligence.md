# ML-005 Card Intelligence — detailed implementation ticket

- Ticket: ML-005
- Priority: P0
- Sprint: Sprint 1 / Walking Skeleton
- Status: Implementation complete; live-provider, Storage integration smoke,
  and physical-device acceptance pending
- Depends on: ML-002 persistence/RLS and ML-004 private scan upload
- Product source: MVP v0.1 US-003, sections 2.1, 4.5, 5.1–5.6, 6.1,
  7–13, 15–19

## Outcome

An accepted private card image is processed as an isolated Card Intelligence
stage. The stage transcribes only visible card facts into the canonical
nullable schema, records confidence per field, persists an owner-scoped card,
marks the scan `card_ready`, and removes the raw image. The user can inspect
and correct extracted fields without mixing extraction with later identity or
relationship inference.

ML-005 stops at verified card facts. Company enrichment, person resolution,
Personal Context retrieval, relationship reasoning, and Flash Brief generation
belong to ML-006 and later tickets.

## Product and technical decisions

The product specification fixes the output fields but not the worker transport
or provider envelope. ML-005 uses these scoped decisions:

- `CardExtractor` is a provider-neutral interface in `packages/ai`; canonical
  schemas remain in `packages/domain`.
- The initial server adapter uses the existing OpenAI Responses SDK with image
  input and strict structured output. `AI_CARD_EXTRACTION_MODEL` selects the
  model at runtime; no model ID enters domain code.
- The API schedules extraction with Next.js `after()` only after ML-004 has
  reached `extracting_card`, preserving the immediate `POST /v1/scans`
  response. A durable external job queue remains a deployment-hardening
  follow-up.
- Extraction uses the authenticated user's Supabase token for the private
  object, scan, card, evidence, and AI-run operations. The raw access token is
  retained only in the response-lifetime closure and is never logged or
  persisted.
- All eight card fields have required confidence values from `0` to `1` in the
  provider contract. A null field must normalize to confidence `0`.
- Every non-null card field is exposed as a `fact` claim sourced from the
  business card. Model output is transcription, never identity inference.
- A database claim function serializes duplicate response-after jobs per scan
  and creates one running `ai_runs` record for the stage.
- Successful persistence, Evidence creation, scan transition, and AI-run
  completion occur in one database function. Raw-object deletion follows; a
  failed delete leaves an immediately expired private path for later cleanup.
- `PATCH /v1/scans/:scanId/card` accepts only the eight card fields. Corrected
  non-null values receive confidence `1`, create `user_correction` evidence,
  and set `user_corrected = true`; original `extraction_json` remains intact.

## Canonical extraction contract

Required nullable fields:

- `name`
- `company`
- `department`
- `title`
- `email`
- `phone`
- `website`
- `address`

Also required:

- `language`: short language/locale identifier such as `ja`, `en`, or
  `ja-JP`
- `field_confidence`: exact map of all eight field names to numbers from `0`
  through `1`

Rules:

- Trim strings; whitespace-only strings normalize to `null`.
- Do not infer missing names, employers, departments, titles, domains,
  addresses, or contact details.
- Preserve visible spelling and script. Do not translate card text.
- Do not infer personality, seniority, gender, nationality, or identity from
  a name, image style, logo, or photograph.
- Extraction stays separate from enrichment and all returned field claims are
  labeled `fact`.

## In scope

### Domain

- Card extraction, persisted business card, field-confidence, fact-claim,
  correction, and status-response schemas.
- Normalization and response projection helpers.
- Typed scan states limited to Card Intelligence readiness/failure.

### AI

- Provider-neutral `CardExtractor` interface.
- Initial OpenAI image + strict structured-output adapter.
- `store: false`, no raw OCR or card data in logs.
- Typed configuration, invalid-output, rate-limit, timeout, and provider
  failures.
- Deterministic tests with injected provider calls.

### Persistence

- Atomically claim one Card Intelligence run for an owned `extracting_card`
  scan.
- Download the private image using the owner token.
- Persist or upsert `business_cards` with original extraction JSON.
- Add `business_card` Evidence for each non-null field.
- Move the scan to `card_ready` and finish `ai_runs` with latency only.
- Mark retryable or terminal failures without storing provider error text.
- Delete the raw image on success and clear its path only after confirmed
  deletion.
- Atomically apply owner-only user corrections and add correction Evidence.

### API

- Schedule extraction after a successful or still-extracting idempotent
  `POST /v1/scans` response.
- `GET /v1/scans/:scanId/status` returns an owner-only stable state and the
  card when ready.
- `PATCH /v1/scans/:scanId/card` validates and applies owner corrections.
- Missing and cross-user records both return `404`.
- No endpoint accepts `user_id`, provider configuration, raw OCR, confidence
  overrides, or extraction JSON from mobile.

### Mobile

- Poll the status endpoint only while the accepted scan is extracting.
- Show retryable/terminal extraction errors without exposing provider details.
- Show the eight extracted fields with an explicit `FACT / 名刺` label.
- Allow field correction and clearing, then save through the correction API.
- Stop polling when leaving the screen or when a terminal state is reached.

### Fixtures and evaluation

- Add at least 10 deterministic, synthetic, non-PII card extraction cases.
- Include Japanese, English, mixed-language, missing title, missing department,
  limited/angled-image output, multiple contact details, sole proprietor,
  and minimal-card cases.
- Validate fixture expectations through ordinary schema/normalization tests.
  Live-provider accuracy remains a separate manual/evaluation gate.

## Error handling

- Missing or deleted raw object: `failed_terminal`; the user must recapture.
- Missing AI configuration: `failed_terminal` and operator action required.
- Rate limit, timeout, provider unavailable, invalid structured output, and
  transient database failure: `failed_retryable`.
- A retry reuses the stable ML-004 scan ID, reuploads the local capture when
  available, and schedules a new extraction run.
- Public responses contain only stable error states/codes; provider response
  text, raw OCR, emails, and phone numbers never enter standard logs.

## Out of scope

- Company or public-web enrichment.
- Person candidate matching or identity status.
- Flash Brief, Mutual Value, or Next Action generation.
- General scan history and delete UI.
- Full durable queue infrastructure, cron, or cross-user cleanup sweeps.
- Prompt tuning against 30 live image cases; this ticket establishes the first
  10 deterministic extraction fixtures.

## Acceptance criteria

- [x] All eight required nullable fields and all field confidences are schema
      validated.
- [x] Null/blank fields normalize safely and cannot carry positive confidence.
- [x] Extraction uses a provider-neutral interface and server-only model
      configuration.
- [x] Image input and provider output are not logged or stored by the provider.
- [x] One accepted scan schedules at most one concurrent extraction run.
- [x] Successful extraction atomically persists the card, FACT Evidence,
      `card_ready`, and succeeded AI-run metadata.
- [x] Successful extraction deletes the private raw object and clears its path.
- [x] Retryable and terminal failures produce the correct database state.
- [x] Status and correction APIs are authenticated, user-scoped, validated,
      and non-disclosing.
- [x] User corrections preserve original extraction JSON and record correction
      provenance.
- [x] Mobile can show, edit, clear, and save extracted facts.
- [x] At least 10 deterministic non-PII fixture cases pass.
- [x] Cross-user card, Evidence, scan, AI-run, and object access remains blocked.
- [x] Lint, typecheck, tests, database tests, formatting, and builds pass.
- [ ] Live-provider extraction and physical-device review pass with fictional
      card data.

## Implementation evidence — 2026-08-17

- `pnpm install --frozen-lockfile`, `pnpm format:check`, and `pnpm check` pass.
- The TypeScript suites contain 93 passing tests: domain 22, AI 12, API 30,
  mobile 18, and deterministic Card Intelligence fixtures 11. The opt-in
  Supabase processor integration test is present and skipped by default.
- `pnpm db:reset` and `pnpm db:lint` pass. `pnpm db:test` passes five files and
  79 pgTAP assertions, including duplicate claim prevention, atomic card and
  Evidence persistence, correction provenance, confidence constraints, and
  cross-user isolation.
- The Next.js production build includes `POST /v1/scans`,
  `GET /v1/scans/[scanId]/status`, and `PATCH /v1/scans/[scanId]/card`. The Expo
  static export also succeeds.
- Generated database types include all four ML-005 RPCs. SHA-256:
  `5780a950a47cffe46ec42e87479739b901a264e44ef4cd6193daf24f985bcaf2`.
- Source/config inspection finds no AI key, service-role key, card/OCR logging,
  or model configuration in mobile sources.
- The opt-in generated-user/generated-byte Storage integration smoke was
  requested but rejected before execution because the approval service had
  reached its usage limit. No workaround was attempted.
- Live OpenAI extraction, provider accuracy review, and physical-device UI
  acceptance remain open and must use fictional data only.

## Validation commands

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

Also run an authenticated end-to-end processor smoke test with an injected
deterministic extractor and generated image bytes. Do not use a real person's
business card, email, phone number, or address.

## Definition of done

- Every non-live/manual acceptance criterion passes or has a recorded
  deviation.
- At least 10 fixture cases pass canonical extraction validation.
- ML-006 can consume a `card_ready` owner-scoped card without reading the raw
  image or provider-specific output.
- Live image extraction is manually reviewed before moving the ticket to
  `completed`.
- Documentation explains model configuration, retry behavior, privacy, and
  raw-image deletion.
