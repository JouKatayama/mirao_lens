# ML-026 Local PC Pilot

- Ticket: ML-026
- Priority: P0
- Status: Complete
- Product source: MVP v0.1 US-002 through US-008

## Outcome

Make the existing Miraio Lens walking skeleton usable by a first external
tester from a desktop browser running against the local API and Supabase stack.

## In scope

- Let web users select a card image without granting or having a camera.
- Accept the same JPEG, PNG, and WebP formats supported by the scan API.
- Clearly label the experience as a pilot and explain AI/output and image
  handling at the first screen.
- Document the shortest local PC pilot startup path.
- Preserve the existing native camera flow.

## Out of scope

- Public hosting, mobile-store distribution, billing, team administration, or
  a durable background queue.
- New relationship-intelligence features.

## Acceptance criteria

- [x] Web reaches a file-selection action without a camera permission gate.
- [x] JPEG, PNG, and WebP selections preserve their validated content type.
- [x] Unsupported image formats show a recoverable error.
- [x] Native camera capture behavior is unchanged.
- [x] The welcome screen identifies the build as a pilot and states the main
      data/AI caveats.
- [x] README contains a local PC pilot runbook.
- [x] `pnpm check` passes.

## Validation evidence

- `pnpm check` passed lint, typecheck, deterministic tests, the Next.js build,
  and the Expo web export.
- The mobile suite passed 106 tests after adding desktop image type coverage.
- The generated Web Pilot and its PC image-selection screen were inspected in
  a browser. The file-selection action appeared without a camera permission
  prompt.
- Full live AI analysis remains configuration-dependent because the local
  `OPENAI_API_KEY` is intentionally not stored in the repository.
