# ML-029: Manufacturing Opportunity Playbook v0.1

## Status

Active. Source: the 2026-11-01 strategy memo "Miraio Lens 製造業特化AI営業戦略"
(shared internally, not stored in the repo), sections 3 (Knowledge Engine, Layer 1 + Layer 3) and 9 (first step: 20-30
playbook entries reviewed by sales reps). The strategy is a hypothesis
document; it does not replace the product spec.

## Fit with the product spec

- Spec 5.6 already degrades to "Industry + Role" and "Role Taxonomy" when
  person and company data are thin. The playbook is that taxonomy for one
  industry, so it adds no new product behavior beyond the existing SAY THIS.
- Spec 5.7 Fact / Hypothesis / Ask: every entry is typed
  `fact_status: "hypothesis"`, and the prompt forbids stating an entry's
  problem as this person's or company's problem.

## Scope (this slice)

1. Domain: `OpportunityPlaybookEntry` / `OpportunityPlaybookHint` schemas and a
   deterministic keyword selector (`packages/domain/src/opportunity-playbook`).
   A person-side signal is required; an offering-only match counts only when the
   person is otherwise in manufacturing.
2. Knowledge: 24 generalized entries across seven themes
   (`packages/ai/src/knowledge/manufacturing-playbook.ts`). Public, generalized
   knowledge only; no employer design data, customer data or internal material.
3. Flash Brief: optional `opportunity_playbook` input (max 3 hints) and prompt
   rules for using it.
4. API: `AI_OPPORTUNITY_PLAYBOOK=on` attaches hints after Personal Context
   retrieval. Off by default; a malformed value falls back to off for the brief.

## Not in this slice

- Vector RAG, Layer 2 (company/news retrieval beyond existing Company Context)
  and Layer 4 (customer-specific outcomes).
- UI that shows the basis (根拠) of the question, or storing which entry was
  used in `flash_brief_json`.
- The A/B/C comparison (ChatGPT / current Miraio / playbook) harness under
  `evals/`.
- Turning it on for the 2026-11-03 pilot; that is a Product Owner decision.

## Acceptance

- Deterministic tests: schema, selector ranking and eligibility, Latin
  word-start matching, playbook size/uniqueness/themes, and the processor
  passing hints only when enabled.
- `pnpm check` passes.

## Risks / follow-ups

- Entries are unreviewed. Sales reps should score them before a pilot uses
  them (strategy section 3.4).
- Keyword selection misses synonyms; measure misses before adding embeddings.
- Whether the prompt actually adopts the entry's question needs a live
  provider smoke run with the flag on.
