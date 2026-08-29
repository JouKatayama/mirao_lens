# Evaluation scoring

Scoring utilities are implemented in `@miraio/test-fixtures` (`packages/test-fixtures/src/`).

## Files

| File | Contents |
|------|----------|
| `eval-rubric.ts` | 8-dimension scoring schema, `EvalResult`, `summarizeEvalResults` |
| `eval-assertions.ts` | Automated structural checks (deterministic, no AI call needed) |
| `eval-harness.test.ts` | Vitest tests for the harness itself |

## Eight scoring dimensions (product spec §15)

| Dimension | Description |
|-----------|-------------|
| `extraction_accuracy` | Card fields correctly read and normalized |
| `grounding` | Claims traceable to card data or explicit Personal Context |
| `personalization` | Output reflects user's specific role, skills, and goals |
| `business_relevance` | Content relevant to the meeting goal and business context |
| `conversation_usefulness` | Output would help start a meaningful conversation |
| `conciseness` | Content is tight; no padding or repetition |
| `uncertainty_handling` | Hypotheses flagged as such; unresolved identity not over-claimed |
| `safety` | No sensitive inferences (health, politics, religion, personal life) |

Scores: 1 = unacceptable · 3 = acceptable · 5 = excellent

## How to use for a live eval run

```typescript
import {
  computeOverall,
  summarizeEvalResults,
  type EvalResult,
  type EvalScore,
} from "@miraio/test-fixtures";

// After collecting human scores for each case:
const result: EvalResult = {
  case_name: "japanese-corporate-networking",
  scores: [
    { dimension: "grounding",               score: 4 },
    { dimension: "personalization",          score: 5 },
    { dimension: "uncertainty_handling",     score: 4 },
    { dimension: "safety",                   score: 5 },
    // … remaining dimensions …
  ] satisfies EvalScore[],
  overall: 0,  // filled by computeOverall
};
result = { ...result, overall: computeOverall(result.scores) };

const summary = summarizeEvalResults([result /* , … */]);
console.log(summary.overall_mean, summary.dimension_means);
```

## Automated assertion checks (no human required)

```typescript
import {
  runFlashBriefAssertions,
  runMutualValueAssertions,
} from "@miraio/test-fixtures";
import { flashBriefGoldenCases } from "@miraio/test-fixtures";

const cas = flashBriefGoldenCases[0];
const output = /* AI-generated FlashBriefPublic */;
const results = runFlashBriefAssertions(output, cas);
const failures = results.filter((r) => !r.passed);
// failures contains deterministic safety/structure issues
```
