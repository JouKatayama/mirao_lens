# Miraio Lens field validation plan (2026-11-03 rehearsal)

## Objective and decision

Use the 3 November 2026 networking event as a **single-user field rehearsal** of the first-meeting flow. Decide whether a B2B exhibitor trial is ready, which workflow gap to fix first, and whether further development is justified. This event is not, by itself, evidence of product-market fit for companies exhibiting at trade shows.

The reference image proposes: A (B2B exhibitors) as the first sales wedge; one-event trials; adoption, behavior change, and relationship progression; then GO / PIVOT / STOP. Keep those as hypotheses. The pictured counts (e.g. 100 cards, 25 follow-ups, 5 meetings) are illustrative, not pass/fail thresholds.

## Current product and scope

The repository already contains mobile card capture, Personal Context, Flash Brief, Mutual Value, a short conversation note, one accepted/completed Next Action, optional local reminders, and analytics events including `brief_viewed`, `say_this_used_yes/no`, `conversation_note_saved`, `next_action_accepted/completed`, and wrong-identity flags. Reminders are local notifications, not automatic outreach. PostHog collection depends on environment configuration, so event delivery must be checked on the test device.

The MVP v0.1 baseline excludes real-time transcription, broad CRM and organization accounts, and automatic outreach. Section 2.3 separately approves event review, local audio memo, HubSpot handoff, and event-limited sharing for the pilot. ML-028 and ADR-0009 define their implementation boundaries. Paid external API calls are not used for implementation or validation. Availability at the November rehearsal still depends on device, backend, and configuration checks.

## Experiment 1: 3 November networking event

**User:** Takahashi, using the product personally. **Setting:** a networking event where phone use after introductions is socially acceptable. **Unit of observation:** an eligible first meeting involving a business-card exchange. Use only cards whose owners agree to the pilot; keep names, card images, and conversation details out of shared experiment notes.

1. **Before:** On the actual phone and network setup, complete sign-in, Personal Context, camera permission, one synthetic-card end-to-end scan, note, Next Action, reminder, and analytics smoke check. Write down the intended meeting goal. Record how many eligible encounters are expected and how many are actually observed.
2. **During:** After each eligible exchange, note whether scanning was socially possible, whether a Brief arrived while still useful, whether its single `SAY THIS` question was used, and whether it helped surface a relevant fact. If not used, record the reason without inventing an outcome. Save a short note and one Next Action when appropriate. The user may skip scanning when it would interrupt the conversation.
3. **After:** Within 24 hours, review accepted actions and send follow-ups manually where appropriate. At 7 days, record whether a follow-up happened and whether a next meeting was agreed. At 30 days, record any relationship progression, separately from what the app directly caused.

### Evidence and denominators

| Measure | Numerator / denominator | Source |
| --- | --- | --- |
| Scan feasibility | Scanned encounters / eligible card exchanges | Manual event tally + scan logs |
| Brief availability | Briefs viewed while still useful / scans | Event note + analytics |
| Conversation adoption | Encounters where `SAY THIS` was actually used / eligible encounters with a viewed Brief | User confirmation, reconciled with analytics |
| Action capture | Accepted Next Actions / meaningful encounters | Product record + event note |
| Follow-through | Completed follow-ups / accepted follow-up actions | Product record + 7-day check |
| Meeting progression | Agreed next meetings / eligible encounters | 7-day check; descriptive only |
| Trust guardrail | Wrong-person or unsupported-claim incidents | User review and incident note |

Record counts alongside percentages. One person and one event can reveal feasibility and failure modes, but cannot establish a reliable uplift or willingness to pay. Compare with the user's own prior workflow only as qualitative context.

### Review decision after the event

- **Proceed to exhibitor trial:** at least some natural scan opportunities, an actually used question that improved a conversation, a saved Next Action, and no serious identity incident. These are evidence prompts, not statistical thresholds.
- **Improve the flow first:** the value is clear but timing, latency, setup, or follow-up handling repeatedly blocks use. Prioritize the observed bottleneck.
- **Reassess the wedge:** phone use is consistently inappropriate, useful questions are rarely adopted, or inaccurate identity/claims undermine trust. Investigate before adding more features.

## Experiment 2: B2B exhibitor trial

Recruit a small number of companies with a scheduled exhibition and a founder or sales lead who both uses the product and can decide on a trial. Use a 20-minute interview about their most recent event **before** showing the product. Ask for baseline counts: cards, qualified conversations, follow-ups, agreed meetings, and current tools. Offer a one-event trial only if the problem is present. The reference image suggests 3–5 companies as a recruitment target; actual sample and dates depend on access.

At the event, measure the same encounter funnel. At 7 and 30 days, ask which specific conversation or follow-up changed and whether the buyer would pay for the next event. A paid pilot is a later commercial test; the pictured price is a hypothesis. Never infer a sales conversion from a scan alone.

## Development decision ladder

| Priority | Candidate work | Trigger | Smallest useful slice / acceptance |
| --- | --- | --- | --- |
| Before 3 Nov | Field readiness and measurement repair | Phone, network, camera, analytics, or note/action flow fails in rehearsal | Actual device completes a synthetic end-to-end scan and records the chosen outcome without real card data in tests. |
| Before 3 Nov | Event review | The Product Owner approved the pilot extension | One event label and a review list; only selected scans join. |
| After 3 Nov | Follow-up prioritization and second follow-up tracking | Accepted actions are not executed or become hard to triage | User can mark priority and completed follow-up; measure change in follow-through before adding more automation. |
| Before 3 Nov | Audio memo | The Product Owner approved the pilot extension | Explicit consent, visible start/stop, local playback/delete, 30-day retention. No automatic transcription. |
| Before 3 Nov | HubSpot handoff | The Product Owner chose HubSpot | Server-side OAuth and explicit reviewed export; fake-provider tests without live calls. |
| Before 3 Nov | Event-limited team read | The Product Owner chose event-scoped sharing | Share selected card facts, reviewed note, and accepted/completed action only. |

The first development priority is the **observed failure** in a real encounter, not the most ambitious feature in the image. Keep fact, hypothesis, and uncertainty labels intact in all slices.

## Dependencies and checkpoints

1. Pilot protocol and privacy handling → device smoke test → 3 November rehearsal → 7/30-day review.
2. Rehearsal findings → smallest product change → exhibitor trial → willingness-to-pay test.
3. Approved pilot extensions follow ML-028 and ADR-0009. Validate each feature on the actual device and configured backend before presenting it as field-ready.

See `tasks/todo.md` for tasks and acceptance checks. The Product Owner separately authorized the product-spec change and implementation on 2026-10-08.

## Risks and open decisions

- A local development setup may not be reachable at the event. Choose and verify a field-safe phone/backend setup before the rehearsal.
- Scanning a card in front of someone may feel awkward despite the event setting; test the actual moment rather than assuming acceptability.
- Analytics may be disabled without PostHog configuration; a privacy-safe manual tally is the fallback.
- Permission to scan/retain real cards and to record outcomes must be handled with each participant. Never use real card images as repository fixtures.
- The B2B exhibitor buyer and the networking-event user may have different incentives. Validate them separately.
