# ADR-0005: Provider-neutral typed decision layer

- Status: Accepted
- Date: 2026-09-21

## Context

Every AI stage in the pipeline currently does two different jobs in one call:
it writes prose and it decides. The Flash Brief writes WHO, WHY YOU and SAY
THIS, and in the same response picks an `identity_status`, a
`why_you_claim_type` and a `potential_score`. Card Intelligence extracts fields
and rates its own confidence in them.

Generation and judgement fail differently. A language model is good at writing
candidates and poor at saying how sure it is: asked for confidence it returns
prose confidence, or a number with no calibration behind it. The product,
meanwhile, is built on that distinction — Fact / Hypothesis / Ask is a locked
v0.1 decision, identity resolution is explicitly a confidence question, and
POTENTIAL is described in the spec as an explainable heuristic rather than a
score for a person.

A separate class of service now exists that answers closed, typed questions —
choose one of these candidates, score on this scale, is this proposition true —
and returns a probability distribution and a confidence instead of prose. We
intend to evaluate one. We are not ready to connect it: no provider has been
chosen on evidence, no threshold has been justified, and the Flash Brief path
has a 5-second budget that an extra network call would spend.

## Decision

- Separate generation from judgement as an architecture boundary. A model
  generates candidates; a decision evaluator selects and scores among
  candidates the caller declared; application code decides what to do with the
  result.
- Define the canonical contract in `packages/ai/src/decision-evaluator.ts`:
  `DecisionEvaluator`, `DecisionEvaluationRequest`, `DecisionQuestion`,
  `DecisionAnswer`, `DecisionEvaluationResult`, `DecisionEvaluatorError`.
  Questions and answers are discriminated unions over `choice`, `score` and
  `boolean`.
- Keep the contract provider-neutral. No vendor name, product name, model ID,
  endpoint or SDK type appears in it, consistent with the locked decision that
  domain code carries no single-model dependency.
- Validate both directions. Request state must be JSON-safe, question ids must
  be unique, a choice must declare distinct non-empty options, a score scale
  needs at least two ascending levels; an answer may only name a declared
  outcome, must cover every declared outcome with a probability, and reports
  probability and confidence in [0, 1]. Anything else becomes a typed
  `DecisionEvaluatorError` rather than a partial result.
- Put provider adapters in `packages/ai`, next to the OpenAI adapters that
  already live there. `apps/api` composes them through the interface.
- Keep SDKs, credentials and provider behavior out of `packages/domain` and
  out of `apps/mobile`.
- Use it first as a shadow evaluation only. `flash-brief-shadow-evaluation.ts`
  scores an already-returned Flash Brief on the eight rubric dimensions from
  product spec section 15. It is pure, it is absent from the package's public
  index, it does not persist anything, and no route calls it.
- Send the shadow evaluation the minimum it needs: name, company, department,
  title, meeting goal, locale, the generated brief, and a capped, truncated
  view of the approved Personal Context. Email, phone, website, the raw card
  image, the raw OCR text and the unabridged Personal Context are excluded by
  construction, because the state is built from an allow-list of fields.
- Do not choose thresholds now. What counts as a passing score is decided after
  the Golden Dataset and human scoring show what the numbers are worth — the
  same order `compareJudgeToHuman` already imposes on the AI judge.
- Treat connecting a real provider, and integrating the decision layer into the
  production pipeline, as separate tickets.

## Consequences

Positive consequences:

- confidence becomes a number with a defined range and a declared outcome set,
  instead of a sentence,
- the eight-dimension rubric has one definition
  (`brief-evaluation-rubric.ts`), shared by the AI judge, the shadow eval and —
  by asserted equality — the human-scoring copy in `@miraio/test-fixtures`,
- a provider can be swapped, or dropped, without touching product meaning,
- the shadow eval can be measured against human scores before anything depends
  on it,
- the 5-second Flash Brief path is unchanged, because nothing calls into this
  layer yet.

Trade-offs:

- the contract exists before any adapter implements it, so its fit with a real
  provider's response shape is unproven,
- a second scoring mechanism now sits beside `brief-judge.ts`; they answer the
  same rubric by different means, and until they are compared, neither
  arbitrates,
- data minimization costs evaluation fidelity: a claim grounded in a Personal
  Context item that was truncated away can be scored as ungrounded,
- shadow results are returned to the caller and not stored, so measuring across
  runs needs a separate decision about persistence.

## Alternatives considered

### Keep asking the generating model for its own confidence

Rejected as the only mechanism. It is what the product does today and it is why
this record exists: self-reported confidence from the model that wrote the text
is not independent of the text, and there is no scale behind it to threshold.
It stays in place until a measured alternative earns the replacement.

### Put the decision contract in `packages/domain`

Rejected. A decision evaluator is an adapter boundary — a thing the product
calls out to — not a business concept. `packages/domain` holds Personal
Context, Card Intelligence, Evidence and the rest, and takes no provider
dependency; the evaluator contract belongs beside the other provider
boundaries in `packages/ai`.

### Write the adapter now against the intended provider

Rejected. An adapter with no measurement behind it invites exactly the mistake
this record is trying to prevent: wiring a scorer into the pipeline, choosing a
threshold to make it act, and discovering afterwards that the scores were never
checked against people. An empty or throw-only adapter class was rejected for
the same reason — it would be a placeholder claiming a decision that has not
been made.

### Gate the Flash Brief on the evaluation immediately

Rejected. A gate needs a threshold, a threshold needs evidence, and the Flash
Brief path has a 5-second budget that a second provider call would consume.
Shadow first, gate later or not at all.
