# ML-028: Event pilot extensions

## Status

Active. Approved by the Product Owner on 2026-10-08. Implement the scope in
product-spec section 2.3 as separate vertical slices. HubSpot is the first CRM;
team sharing is limited to explicitly selected encounters in one event.

## Order and acceptance

1. **Event grouping:** An owner creates an event, selects it for a scan, and
   reviews only scans in that event. Other scans and users remain unaffected.
2. **Audio memo:** Explicit participant-consent acknowledgement precedes a
   visible start/stop recording. The owner can play/delete it; any generated
   text is reviewed before saving as a note. Audio cannot silently enter card
   facts, identity resolution, or analytics.
3. **HubSpot:** User-owned OAuth connection stays on the server. A reviewed,
   explicit export sends only selected contact fields and optional reviewed
   note/action to one HubSpot portal. A retry does not create duplicate records.
4. **Event team:** An owner invites an account to one event. A member sees only
   selected card facts, reviewed note, and action status for that event. Access
   disappears on revocation; no raw image or Personal Context is shared.

Each slice needs deterministic non-PII tests and the strongest applicable repo
checks. Security or data-model decisions require an ADR before implementation.
Do not change the existing private owner-scoped scan APIs into broad team APIs.

## Initial risks

- `expo-audio` is installed, but recording/playback and lifecycle stopping still
  need verification on Android and iOS hardware.
- Live HubSpot OAuth/export requires credentials and a portal; use contract
  tests with a fake provider until that configuration is available.
- Shared data must be deliberately scoped to an event and must not widen RLS
  access to private AI or image records.
- Team invitation currently uses a member's account UUID. Validate the pilot
  handoff with two synthetic accounts before field use.
