import { describe, expect, it } from "vitest";

import {
  assertJevHumanTemplateMatches,
  compareJevShadowToHuman,
  compareJevHumanReviews,
  makeJevHumanTemplate,
} from "./jev-shadow-human-review";
import type { JevShadowRun } from "./jev-shadow-report";

const runs: readonly JevShadowRun[] = [
  {
    case_name: "synthetic-case",
    repeat: 1,
    total_latency_ms: 1,
    evaluations: [
      {
        evaluation: "say_this",
        latency_ms: 1,
        answers: [
          {
            type: "choice",
            question_id: "pick",
            selected: "abstain",
            confidence: 0.6,
            probabilities: { a: 0.4, abstain: 0.6 },
          },
          {
            type: "score",
            question_id: "score",
            modal_level: 4,
            expected_score: 4.4,
            confidence: 0.5,
            probabilities: { "1": 0, "2": 0, "3": 0, "4": 0.6, "5": 0.4 },
          },
          { type: "boolean", question_id: "holds", probability: 0.8 },
        ],
      },
    ],
  },
  {
    case_name: "synthetic-case",
    repeat: 2,
    total_latency_ms: 1,
    evaluations: [
      {
        evaluation: "say_this",
        latency_ms: 1,
        answers: [
          {
            type: "choice",
            question_id: "pick",
            selected: "abstain",
            confidence: 0.5,
            probabilities: { a: 0.45, abstain: 0.55 },
          },
          {
            type: "score",
            question_id: "score",
            modal_level: 5,
            expected_score: 4.5,
            confidence: 0.5,
            probabilities: { "1": 0, "2": 0, "3": 0, "4": 0.5, "5": 0.5 },
          },
          { type: "boolean", question_id: "holds", probability: 0.6 },
        ],
      },
    ],
  },
];

const request = {
  state: { card: "synthetic" },
  questions: [
    {
      id: "pick",
      type: "choice" as const,
      prompt: "Pick one",
      options: ["a", "abstain"],
    },
    {
      id: "score",
      type: "score" as const,
      prompt: "Rate",
      levels: [1, 2, 3, 4, 5],
    },
    { id: "holds", type: "boolean" as const, prompt: "Is it true?" },
  ],
};

describe("Jev human review", () => {
  it("creates an independent unscored sheet with the exact shadow state and questions", () => {
    const template = makeJevHumanTemplate([
      {
        case_name: "synthetic-case",
        evaluation: "say_this",
        request,
      },
    ]);

    expect(template.cases[0]?.evaluations[0]?.state).toEqual(request.state);
    expect(template.cases[0]?.evaluations[0]?.questions[0]).toEqual({
      question: request.questions[0],
      human_answer: null,
    });
    expect(template.cases[0]?.evaluations[0]?.questions).toHaveLength(3);
    const review = compareJevShadowToHuman(runs, template);
    expect(review.coverage).toEqual({ labeled: 0, total: 3 });
    expect(review.score.expected_mae).toBeNull();
    expect(review.choice.exact_agreement).toBeNull();
  });

  it("uses unique labeled questions, not repeats, as its denominator", () => {
    const template = makeJevHumanTemplate([
      {
        case_name: "synthetic-case",
        evaluation: "say_this",
        request,
      },
    ]);
    const evaluation = template.cases[0]!.evaluations[0]!;
    const anchors = {
      ...template,
      cases: [
        {
          ...template.cases[0]!,
          evaluations: [
            {
              ...evaluation,
              questions: [
                { ...evaluation.questions[0]!, human_answer: "abstain" },
                { ...evaluation.questions[1]!, human_answer: 5 },
                { ...evaluation.questions[2]!, human_answer: true },
              ],
            },
          ],
        },
      ],
    };

    const result = compareJevShadowToHuman(runs, anchors);

    expect(result.coverage).toEqual({ labeled: 3, total: 3 });
    expect(result.choice).toEqual({
      count: 1,
      decisive_count: 1,
      exact_agreement: 1,
      mean_human_option_probability: 0.575,
    });
    expect(result.abstain).toEqual({
      count: 1,
      human_abstain: 1,
      jev_abstain: 1,
      exact_agreement: 1,
    });
    expect(result.score?.count).toBe(1);
    expect(result.score?.expected_mae).toBeCloseTo(0.55);
    expect(result.score?.modal_exact_agreement).toBeNull();
    expect(result.boolean?.brier).toBeCloseTo(0.09);
    expect(result.details).toHaveLength(3);
  });

  it("rejects unknown labels and changed question definitions", () => {
    const template = makeJevHumanTemplate([
      {
        case_name: "synthetic-case",
        evaluation: "say_this",
        request,
      },
    ]);
    const evaluation = template.cases[0]!.evaluations[0]!;
    const bad = {
      ...template,
      cases: [
        {
          ...template.cases[0]!,
          evaluations: [
            {
              ...evaluation,
              questions: [
                { ...evaluation.questions[0]!, human_answer: "missing" },
                ...evaluation.questions.slice(1),
              ],
            },
          ],
        },
      ],
    };

    expect(() => compareJevShadowToHuman(runs, bad)).toThrow();
    expect(() => assertJevHumanTemplateMatches(template, bad)).not.toThrow();
    expect(() =>
      assertJevHumanTemplateMatches(template, {
        ...template,
        cases: [
          {
            ...template.cases[0]!,
            evaluations: [{ ...evaluation, state: { card: "changed" } }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      compareJevShadowToHuman(runs, {
        ...template,
        cases: [
          {
            ...template.cases[0]!,
            evaluations: [
              { ...evaluation, questions: evaluation.questions.slice(1) },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("only compares review deltas with identical human labels and coverage", () => {
    const template = makeJevHumanTemplate([
      {
        case_name: "synthetic-case",
        evaluation: "say_this",
        request,
      },
    ]);
    const current = compareJevShadowToHuman(runs, template);
    expect(compareJevHumanReviews(current, current)).toMatchObject({
      comparable: true,
    });
    const changed = { ...current, anchor_fingerprint: "changed" };
    expect(compareJevHumanReviews(current, changed)).toEqual({
      comparable: false,
      reason: "human_labels_changed",
    });
  });
});
