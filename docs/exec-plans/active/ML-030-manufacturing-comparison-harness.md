# ML-030: Manufacturing A/B/C comparison harness

## Status

Active. Follows ML-029. Source: section 6 of the 2026-11-01 strategy memo
"Miraio Lens 製造業特化AI営業戦略" (shared internally, not stored in the repo).

## Scope

1. 24 synthetic manufacturing first-meeting cases (3 sellers x 8
   counterparts), tagged by data richness
   (`packages/test-fixtures/src/manufacturing-comparison-fixtures.ts`).
2. Blind labelling (X/Y/Z, fixed per case, varied across cases), rating
   validation, unblinded summary per condition and per data richness, and a
   verdict (`manufacturing-comparison-scoring.ts`).
3. An opt-in live run comparing A generic chat, B the shipped Flash Brief and
   C the Flash Brief with the playbook, on one model and one input set
   (`packages/ai/src/manufacturing-comparison.eval.test.ts`). Outputs go to the
   git-ignored `evals/reports/`.
4. `attachOpportunityPlaybook` moves into `@miraio/domain` so the API and the
   harness attach the playbook the same way.

Procedure: `evals/manufacturing-comparison/README.md`.

## Not in this slice

- Running the comparison (needs a key, a model choice and reviewers).
- Field measurement of time-to-question and real adoption.
- An LLM judge; reviewers rate by hand first.

## Acceptance

- Deterministic tests for the case set, blind assignment, summary, verdict and
  single-question check.
- The live run is skipped unless explicitly enabled.
- `pnpm check` passes.
