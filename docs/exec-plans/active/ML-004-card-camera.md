# ML-004 Card Camera — detailed implementation ticket

- Ticket: ML-004
- Priority: P0
- Sprint: Sprint 1 / Walking Skeleton
- Status: Implementation complete; native-device acceptance pending
- Depends on: ML-001, ML-002, authenticated navigation from ML-003
- Product source: MVP v0.1 US-002, sections 4.1–4.5, 9–14, 16–20

## Outcome

An authenticated user with usable Personal Context can start a first scan,
grant camera permission only when asked, frame and photograph the front of a
business card, review or retake the capture, and upload it into private
user-scoped storage. A durable scan ID exists before transfer and the server
hands the new scan to the `extracting_card` state without waiting for later
enrichment.

ML-004 stops at the Card Intelligence handoff. OCR, card-field extraction,
confidence scoring, and field correction belong to ML-005.

## Product and technical decisions

The product specification does not lock the transport envelope or native
camera package. ML-004 uses these scoped decisions:

- Expo Camera `CameraView` with the rear camera and a front-side card frame.
- The camera permission is checked when entering capture and requested only
  after the user presses the permission action.
- The client generates a UUID scan ID before upload so retry uses one durable
  identity and the UI can refer to the scan immediately.
- `POST /v1/scans` receives authenticated binary image data. Metadata is sent
  in `X-Scan-Id`, `X-Meeting-Goal`, and `Content-Type` headers.
- The server derives the owner from the verified Supabase session, writes the
  scan row, and uploads through the same user-scoped Supabase client. No
  service-role credential is required by mobile or the API.
- The private object path is
  `<authenticated-user-id>/<scan-id>/front.<extension>`.
- A one-hour `raw_image_expires_at` is assigned at reservation time. ML-005 or
  the deployment cleanup worker must perform physical deletion after
  extraction; ML-004 cannot react to an extraction-success event that does not
  exist yet.

## In scope

### Domain contracts

- Canonical meeting goals:
  - `networking`
  - `sales`
  - `recruiting`
  - `partnership`
  - `learning_information_exchange`
  - `other`
- Scan capture metadata and response schemas.
- Closed accepted image MIME types aligned with the private bucket.
- Image byte-size rules aligned with the 10 MiB bucket limit.
- Language-neutral stored values and Japanese UI labels.

### Mobile

- A Home / Scan entry after Personal Context completion.
- One-tap meeting-goal selection, defaulting to Networking.
- Permission explanation, request action, denied state, retry, and system
  settings recovery when the OS no longer allows prompting.
- Rear-camera preview and visible landscape business-card frame.
- Capture only after camera readiness.
- Captured image preview, retake, and explicit upload action.
- Duplicate-submit prevention while capturing/uploading.
- Retryable upload failure that preserves the local preview and scan ID.
- Auth-expiry handling through the existing session gate.
- Successful handoff state showing that card reading has started.

### API / BFF

Implement authenticated `POST /v1/scans`.

Required headers:

```text
Authorization: Bearer <Supabase access token>
Content-Type: image/jpeg
X-Scan-Id: <client-generated UUID>
X-Meeting-Goal: networking
```

Representative success response:

```json
{
  "scan_id": "uuid",
  "status": "extracting"
}
```

Behavior:

1. Validate authentication and metadata without logging image or identity
   content.
2. Reserve an owner-scoped scan with status `created`, deterministic private
   path, and expiration metadata.
3. Reject empty and over-10-MiB bodies.
4. Upload to the existing private `business-card-images` bucket.
5. Advance the row to `extracting_card` only after upload succeeds.
6. On retry with the same scan ID and metadata, return the existing successful
   result or safely retry a `created`/`failed_retryable` upload.
7. On transfer failure, preserve the scan as `failed_retryable` and return a
   sanitized retryable error containing only the scan ID.

HTTP behavior:

- `201`: new scan image accepted.
- `200`: idempotent replay of an already accepted scan.
- `400`: invalid UUID, meeting goal, MIME type, or empty body.
- `401`: missing, invalid, or expired session.
- `409`: a reused scan ID has incompatible metadata.
- `413`: image exceeds 10 MiB.
- `503`: retryable storage/upload failure.
- `500`: unexpected database failure with correlation ID and no raw image or
  business-card content in logs.

### Persistence and storage

- Reuse the existing `scans` table, status constraint, composite ownership
  key, RLS, and private bucket from ML-002.
- Do not accept `user_id` in the request.
- Persist `meeting_goal`, `raw_image_path`, and `raw_image_expires_at` when the
  scan is reserved.
- Use the authenticated user's token for both table and object operations.
- Preserve the private-bucket MIME and 10 MiB limits.
- Never create a public or long-lived signed image URL.

## Out of scope

- OCR or multimodal extraction.
- Creating or correcting `business_cards` fields.
- Processing progress polling beyond the upload handoff.
- Flash Brief, Mutual Value, public enrichment, notes, or Next Actions.
- Scan history and scan deletion UI.
- Analytics delivery infrastructure.
- Permanent raw-card storage.
- Background cleanup scheduling; the expiration contract is established here
  and consumed when ML-005 introduces extraction completion.

## Security and privacy

- The mobile bundle contains only public Supabase and API-origin settings.
- The API never logs the authorization header, image bytes, file URI, email,
  phone, OCR content, or raw card data.
- Object paths use only authenticated owner ID, scan UUID, and a fixed filename.
- Cross-user IDs must not reveal whether another user's scan exists.
- Failed captures remain private and receive an expiration timestamp.
- Fixtures use generated bytes and `.invalid` identities only.

## Test plan

### Domain

- Accept every canonical meeting goal and reject unknown values.
- Accept every bucket-supported MIME type and derive a safe extension.
- Reject invalid scan IDs, empty images, and images over 10 MiB.
- Parse only the public `extracting` response state.

### API

- Missing bearer token returns `401` without reserving or uploading.
- Invalid headers and oversized bodies fail before upload.
- Valid upload reserves, uploads, advances state, and returns `201`.
- Accepted replay returns `200` without a second upload.
- Failed upload marks the scan retryable and returns sanitized `503`.
- Conflicting replay returns `409` without leaking owner information.

### Database and storage

- Two authenticated users cannot read or update one another's scan rows.
- A user can upload only below their own storage prefix.
- Anonymous upload is rejected.
- Successful reservation stores path, expiration, goal, and expected state.

### Mobile

- Default meeting goal is Networking and stored values stay language-neutral.
- Binary upload sends one stable scan ID and required headers.
- API responses and typed errors are validated.
- Permission-denied, retake, retry, and expired-session actions remain
  recoverable.
- Static export and native TypeScript compilation include Expo Camera safely.

## Manual acceptance

On a physical device or native simulator:

1. Sign in and finish Personal Context.
2. Select a meeting goal and open capture.
3. Confirm the OS permission dialog appears only after pressing the permission
   action.
4. Deny once and verify retry/settings guidance.
5. Grant permission and align a fictional card inside the frame.
6. Capture, retake, capture again, and upload.
7. Confirm one scan ID and one private object are created.
8. Confirm the row reaches `extracting_card` and carries an expiration time.
9. Confirm a second user cannot read the row or object.

Do not photograph or retain a real person's business card for acceptance.

## Acceptance criteria

- [x] Camera permission is requested only from the capture flow.
- [x] Permission denial has a usable retry/settings recovery action.
- [x] A clear front-side card frame is visible over the rear camera.
- [x] The user can capture, preview, and retake before upload.
- [x] Meeting goal defaults to Networking and can be changed in one tap.
- [x] A client-generated scan ID remains stable through upload retries.
- [x] The image is limited to accepted MIME types and 10 MiB.
- [x] The image is uploaded privately under the authenticated user prefix.
- [x] A scan row records goal, path, expiration, and extraction handoff state.
- [x] Replays do not create duplicate scans or object paths.
- [x] Storage and row access remain isolated between users.
- [x] No service-role secret or raw card data enters mobile config or logs.
- [x] API, mobile, domain, database, formatting, and build checks pass.
- [ ] Native-device/simulator manual acceptance passes with fictional data.

## Implementation evidence — 2026-08-17

- `pnpm check` passes lint, typecheck, 56 TypeScript tests, the Next.js API
  production build, and the Expo web static export.
- `pnpm db:reset`, `pnpm db:lint`, and `pnpm db:test` pass. The database suite
  contains 60 pgTAP assertions, including ML-004 row/storage ownership and
  anonymous-access rejection.
- Regenerating database types leaves
  `packages/db/src/database.types.ts` unchanged (SHA-256
  `1ca641a83c44bef603c2722192c5a5e737d5fecc4390278ab977d11590a3dfc6`).
- A local authenticated runtime smoke test with generated four-byte fixture
  data returned `extracting`, stored one private object, reached
  `extracting_card`, preserved meeting goal and expiration metadata, and
  returned the same scan for an idempotent replay.
- Source/config inspection found no service-role secret or raw card-data
  logging in the ML-004 paths.
- Physical iOS/Android camera permission, framing, focus, retake, and upload
  acceptance remains open. Only fictional card data may be used.
- Physical deletion of expired raw images remains assigned to the ML-005
  extraction-success/cleanup flow; ML-004 records and refreshes the one-hour
  expiry contract but has no extraction-complete event to consume.

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

Also run a local authenticated binary upload using generated non-image fixture
bytes with an accepted test MIME header. Physical-camera acceptance remains
manual because the web export cannot validate native camera permission or
focus behavior.

## Definition of done

- Every non-manual acceptance criterion passes or has a recorded deviation.
- The native capture flow passes on at least one iOS or Android target before
  the plan moves to `completed`.
- ML-005 can receive the persisted `extracting_card` scan without changing the
  ML-004 public response.
- Documentation explains capture configuration, privacy, and local testing.
- The repository-standard implementation report is produced.
