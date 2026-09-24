# ADR-0007: Defer Jev product integration

- Status: Accepted
- Date: 2026-09-23

## Context

The team decided to put Jev integration on hold while the Miraio Lens product
concept and MVP are shown and tested. ADR-0006 established a Jev adapter and
opt-in shadow evaluations, but no production route calls them. The later
card-likeness experiment also evaluates extracted field patterns, not image
pixels; it cannot establish that the photographed object is a business card.

There is no human-labeled accuracy result or chosen threshold for using a Jev
answer to block a scan or alter a Flash Brief. A new provider call would also
spend time in the fast path.

## Decision

- Keep Jev out of the production API and scan pipeline. No product result or
  scan state depends on a Jev answer.
- Remove the Jev adapter from the public `@miraio/ai` entry point and remove
  its unused configuration reader and variables from the API environment
  example. The app does not need a TypeSafe key to run.
- Retain the provider adapter and opt-in synthetic shadow evaluations under
  `packages/ai` as research assets. They may be run explicitly with a separate
  key; ordinary product commands do not invoke them.
- Reconsider integration only after a concrete product decision is identified,
  human-labeled cases establish accuracy and an abstain policy, and latency and
  failure behavior fit the chosen user flow.

## Consequences

The MVP continues to use the existing staged Card Intelligence and relationship
pipeline. Jev remains available for isolated measurement without implying that
it is part of the product. Research results cannot be presented as production
behavior.

## Alternatives considered

### Connect Jev to card acceptance now

Rejected. Jev receives structured JSON rather than the image, and the current
field-pattern experiment cannot distinguish a card from another document with
the same extracted fields. There is no measured threshold for blocking users.

### Delete all Jev experiments

Rejected. The synthetic evaluation code can still answer a later, scoped
question without adding a production dependency path or changing the user
experience.
