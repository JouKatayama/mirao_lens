# ADR-0009: Event pilot data boundaries

- Status: Accepted
- Date: 2026-10-08

## Context

The approved pilot adds event grouping, audio notes, HubSpot export, and event
team viewing. Existing scans and AI outputs are private to their owner. A broad
scan RLS policy would expose card images, Personal Context relationships, and
unreviewed AI content to event members.

## Decision

- An event belongs to one user. A scan joins at most one event after an explicit
  selection by its owner. A composite foreign key proves both have the same owner.
- Team membership grants read access only to a database projection of selected
  card facts, the owner's reviewed note, and action text/status. It grants no
  direct read access to owner tables. Revocation is checked at read time.
- Recording starts only after an explicit consent acknowledgement. Audio and
  drafts stay owner-private, are removed with the scan, and are not used as
  evidence or analytics. The retention period is 30 days.
- HubSpot credentials and refresh tokens stay on the server encrypted at rest.
  Only a user-reviewed, explicitly selected contact export is permitted. No
  raw image, private context, or unreviewed AI content is sent.
- Paid external API calls are not run during implementation or validation.
  Provider contracts are tested with fakes until configured by the owner.

## Consequences

Event-scoped views use a dedicated authorization path. Existing owner APIs and
RLS stay unchanged. The mobile app can use its own server API without invoking
paid external services.
