# ADR-0006: TypeSafe/Jev as the first decision evaluator, in shadow

- Status: Accepted
- Date: 2026-09-22

## Context

ADR-0005 defined `DecisionEvaluator` against a class of service that answers
closed, typed questions with probability distributions, and deliberately
stopped short of connecting one: no provider had been chosen on evidence, and
the Flash Brief path has a 5-second budget that an extra network call would
spend.

That class of service now has a member we can use. TypeSafe's Jev takes one
state and a set of named questions — `choice`, `score`, `noul` — and answers
all of them in a single pass with probabilities and, for the first two, a
confidence. The shape is the contract's shape, which is unsurprising: the
contract was written against this class of service.

Connecting it surfaced four things the contract did not anticipate.

Jev's `score` is an expected value that falls between levels (1.43 on a
three-level rubric) and its levels are rubric positions counting from zero. The
contract declares its own level values and expects one of them back.

Jev's `noul` returns the probability of yes and nothing else — no verdict, no
separate confidence. The contract required both.

Jev wants a written description for every choice label and every score level,
and its accuracy depends on them. The contract carried labels and numbers.
Meanwhile the product's own prompts already contained exactly those
descriptions, as prose, inline: POTENTIAL's five levels, Identity Status's four
values, Mutual Value's fact/hypothesis definitions.

And measurement needs numbers that are stable enough to compare. Five live
calls put Jev's latency at 534–723ms per cold process and 208–515ms within a
warm one, against a published 70–500ms. Repeated calls on one case returned an
identical selection every time and a `confidence` that moved between 0.43 and
0.53 — and, on a score question, a modal level that flipped between 4 and 5
while the expected score stayed inside 4.20–4.38.

## Decision

- Adopt TypeSafe/Jev as the first `DecisionEvaluator` adapter, in
  `packages/ai/src/providers/jev-decision-evaluator.ts`. Everything
  vendor-specific stops there: no SDK type, model id, endpoint or error class
  crosses back out, and `packages/domain` and `apps/mobile` never see it.
- Use it only from shadow evaluations. Four exist — the Flash Brief rubric, the
  SAY THIS candidate selection, POTENTIAL, and Mutual Value's claim types. None
  persists anything, none is reachable from a route, none is exported from the
  package index, and none changes what a user sees.
- Report the expected score, not the modal level, when comparing runs. The
  modal level is discontinuous where two levels are close, and moves a whole
  point while the distribution barely shifts. `expectedDecisionScore` computes
  it from the distribution the contract already carries.
- Carry outcome descriptions in the contract: `levelDescriptions` on a score
  question, `optionDescriptions` on a choice question. Both optional, and both
  required to cover every declared outcome when supplied — a rubric with holes
  asks an evaluator to guess what the gaps mean, and the guess is invisible in
  the number that comes back.
- Keep one copy of each rubric. `potential-score-rubric.ts`,
  `identity-status-rubric.ts` and `mutual-value-claim-rubric.ts` hold the text,
  the generator's system prompt is composed from them, and the shadow
  evaluations read the same constants. Two copies of a scale produce two
  numbers that cannot be compared, and the disagreement would read as a finding
  about the product rather than as a difference between two rubrics.
- Never show an evaluator the answer it is being asked to produce. The
  generator's `potential_score`, `identity_status` and `claim_type` values are
  excluded from shadow state by construction.
- Let an adapter report less than the contract allows rather than synthesise
  what a provider did not return. A `noul` answer carries a probability and no
  verdict, because deriving one means choosing a threshold, and ADR-0005 put
  that choice in application code.
- Keep thresholds out. Nothing in this layer compares a number to a bar.

## Consequences

Positive consequences:

- the decision layer has a working implementation, so the contract's fit with a
  real provider's response shape is no longer a guess,
- three rubrics that existed only as prose inside prompts are now shared
  constants with pinned tests, so a rubric edit cannot silently reach a
  production prompt,
- confidence in POTENTIAL, Identity Status and Mutual Value claims can be read
  as a distribution rather than a label, without changing any of them,
- the adapter's posture is assertable rather than described: SDK logging is off
  because the state carries Personal Context, retries are the caller's, and
  each attempt is bounded.

Trade-offs:

- a second provider account, key and failure mode now exist. `TYPESAFE_API_KEY`
  is read in `apps/api/lib/server-config.ts` and used by no route,
- Jev's score translation is lossy in one direction: the contract's `score`
  becomes the modal level, and Jev's own expected value is recoverable from the
  distribution rather than carried directly,
- no branch maps to `quota_exhausted`. TypeSafe documents 401, 422, 429 and 529
  and no billing-specific signal, so a spent balance is currently
  indistinguishable from rate limiting — the defect `provider-error.ts` records
  having shipped five times over, left open deliberately rather than guessed
  at,
- four shadow evaluations is four more things to keep consistent with the
  prompts they mirror,
- shadow results are still not persisted, so comparing across runs remains a
  separate decision.

## Alternatives considered

### Relax the contract so `score` accepts a continuous value

Rejected for now. It is the more faithful translation — Jev's expected score is
strictly more information than a level — but it changes what `score` means for
every existing caller, including the Flash Brief shadow evaluation written
before any adapter existed. Reporting the modal level and recovering the
expectation from the distribution keeps both readings available and changes no
existing meaning. Revisit if a caller needs the expectation as the primary
value.

### Synthesise `holds` and `confidence` for a `noul` answer

Rejected. Both would be inventions: a verdict requires a threshold, and a
spread-derived confidence is meaningless for a two-outcome question where the
probability already reports the answer and the certainty together. Making the
fields optional says what is true — this evaluator answers with a probability —
instead of filling the shape with numbers no provider produced.

### Leave the rubric text inline and duplicate it for the evaluator

Rejected. It is the cheaper change and it defeats the measurement: the moment
the two copies differ, the shadow evaluation is scoring a different scale than
the generator used, and the difference is invisible. Extracting the text meant
touching a production prompt, which is why each extraction is verified
byte-for-byte and pinned by a test.

### Write the missing rubric levels as new criteria

Rejected. The Flash Brief scale named 1, 3 and 5 and left 2 and 4 undefined for
both the AI judge and the human scorer. Those two levels are now written, but
as degree — how far short, how close — never as new things to judge. An anchor
that named a dimension would silently re-weight that dimension against the
other seven.

### Connect Mutual Value or the Flash Brief to Jev now

Rejected. Every measurement so far is one synthetic case. Production selection
needs agreement with human labels, an `abstain` that fires when it should, a
p95 the Fast Path can absorb, and a known billing-exhaustion signal — and, when
it comes, an asynchronous path or an explicit feature flag, per ADR-0005.
