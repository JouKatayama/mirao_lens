# Human anchor scores

This directory holds the cases **people** have scored. It is the only thing
that makes the AI judge's scores mean anything.

## Why this exists

The judge in `packages/ai/src/brief-judge.ts` scores Flash Briefs on the same
eight dimensions a human reviewer would. That is convenient and it is not
self-validating: an AI scoring AI output rewards the habits it shares with the
writer, so a loop driven by an unchecked judge produces a rising score while
optimizing toward what the judge likes. The score goes up either way, which is
exactly why the number alone cannot be trusted.

So the eval reports the judge's agreement with these files **before** it
reports any product score. Until agreement holds, the thing to fix is the
judge's instructions, not the product.

## Making the sheet

1. Run the judge eval once to produce `evals/reports/latest.json`.
2. Copy it to `evals/anchors/human-scores.json`.
3. Replace every `score` with your own 1–5 judgement. Delete the judge's
   `notes` rather than reading them first — a scorer who has seen the judge's
   reasoning is no longer independent of it, and the agreement figure stops
   measuring anything.
4. Drop any case you are not confident about. A partially scored sheet is
   fine: unpaired cases and unpaired dimensions are excluded from the figures
   rather than counted as agreement.

The file is either a bare array of results or an object with a `results` array,
so an edited report works unchanged.

```json
{
  "results": [
    {
      "case_name": "saas-field-sales/manufacturing-it-manager",
      "scores": [
        { "dimension": "grounding", "score": 3 },
        { "dimension": "personalization", "score": 4 }
      ],
      "overall": 3.5
    }
  ]
}
```

## How many, and who

Thirty to fifty cases, scored by people who actually exchange business cards
for a living — the sales side, not the engineering side. What counts as a
useful opening line is not an engineering judgement, and the anchor set is
where that expertise enters the system.

Two or more scorers on the same cases is better than one, because it shows how
much people disagree with each other. The judge only has to land inside that
spread; demanding better agreement than two humans manage is demanding noise.

## Reading the result

`compareJudgeToHuman` in `@miraio/test-fixtures` reports:

| Figure                 | Bar    | Meaning                                                                                                                                        |
| ---------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| mean \|judge − human\| | ≤ 0.6  | Typical distance in rubric points.                                                                                                             |
| within 1 point         | ≥ 0.9  | The practical bar — two careful people disagree by a point routinely.                                                                          |
| judge bias             | ≤ ±0.3 | judge mean − human mean. **Positive means the judge is the softer marker**, which is the direction self-agreement pushes. Read this one first. |
| correlation            | —      | Whether the judge ranks cases the way people do. `n/a` when one side gave everything the same score.                                           |

Failing the bars is not a product failure. It means the judge's instructions
need work: sharpen the dimension definitions it disagrees on, then re-run.

These files are committed. They contain scores of synthetic cases, so they
carry no personal or business data — and they are the slowest asset here to
rebuild.

## Jev shadow human review (offline)

This is separate from the OpenAI brief judge above. It compares the five Jev
shadow evaluations with human answers to the **same closed questions**. It
does not call Jev or OpenAI and does not set a threshold.

1. First run `MIRAIO_RUN_JEV_SHADOW=1` with `TYPESAFE_API_KEY` to produce
   `evals/reports/jev-shadow-latest.json` (see the shadow runner). Do not
   expose this report to human scorers before they label.
2. In PowerShell, run:

   ```powershell
   $env:MIRAIO_RUN_JEV_HUMAN_REVIEW = "1"
   pnpm --filter @miraio/ai exec vitest run src/jev-shadow-human-review.eval.test.ts --disable-console-intercept
   ```

   This creates `evals/reports/jev-shadow-human-template.json`: 3 synthetic
   cases, 5 evaluations per case, 87 questions. Each contains the **exact
   minimized state and question** shown to Jev, but no Jev answer.

3. Copy that template to `evals/anchors/jev-shadow-human-labels.json`. Have
   reviewers fill only `human_answer`: one declared option string for a
   `choice`, one declared numeric level for a `score`, or `true`/`false` for a
   `boolean`. Leave uncertain or unreviewed answers as `null`. Do not copy
   Jev's answers or infer labels from its probabilities.
4. Re-run the command. It writes
   `evals/reports/jev-shadow-human-review.json` with coverage, per-question
   comparisons and previous-run deltas. No API key is needed for this step.

The denominator is unique labeled case/evaluation/question combinations,
**not** the number of repeated Jev calls. Choice agreement uses the majority
selection across repeats; ties are reported as undecided and omitted from the
agreement denominator. `abstain` is a normal choice and also has its own
summary. Score error is the absolute difference between the human level and
the mean Jev **expected score** across repeats. Modal-level agreement is shown
separately, with tied modes omitted. Boolean Brier error uses the mean Jev
probability against the human true/false label. Previous-run deltas are only
comparable if the human labels and coverage are unchanged.

The shadow state omits raw card image/OCR and some Personal Context by design.
Reviewers can therefore judge the stated questions against that context, but
this sheet cannot establish OCR extraction accuracy or human agreement on the
full original context. One reviewer per question also does not measure
inter-rater agreement. Neither limitation should be read as a passing gate.
