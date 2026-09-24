import { describe, expect, it } from "vitest";

import {
  compareJevShadowReports,
  parseJevShadowRepeats,
  summarizeJevShadowRuns,
  type JevShadowReport,
  type JevShadowRun,
} from "./jev-shadow-report";

const runs: readonly JevShadowRun[] = [
  {
    case_name: "case-a",
    repeat: 1,
    total_latency_ms: 300,
    evaluations: [
      {
        answers: [
          {
            confidence: 0.4,
            modal_level: 4,
            expected_score: 4.4,
            probabilities: { "1": 0, "2": 0, "3": 0.1, "4": 0.4, "5": 0.5 },
            question_id: "quality",
            type: "score",
          },
          {
            confidence: 0.6,
            probabilities: { a: 0.6, b: 0.4 },
            question_id: "selection",
            selected: "a",
            type: "choice",
          },
        ],
        evaluation: "flash_brief",
        latency_ms: 100,
      },
    ],
  },
  {
    case_name: "case-a",
    repeat: 2,
    total_latency_ms: 360,
    evaluations: [
      {
        answers: [
          {
            confidence: 0.5,
            modal_level: 5,
            expected_score: 4.4,
            probabilities: { "1": 0, "2": 0, "3": 0.1, "4": 0.4, "5": 0.5 },
            question_id: "quality",
            type: "score",
          },
          {
            confidence: 0.55,
            probabilities: { a: 0.55, b: 0.45 },
            question_id: "selection",
            selected: "a",
            type: "choice",
          },
        ],
        evaluation: "flash_brief",
        latency_ms: 120,
      },
    ],
  },
];

describe("parseJevShadowRepeats", () => {
  it("uses one repeat when the variable is absent", () => {
    expect(parseJevShadowRepeats(undefined)).toBe(1);
  });

  it("accepts a positive integer", () => {
    expect(parseJevShadowRepeats("5")).toBe(5);
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects %s", (value) => {
    expect(() => parseJevShadowRepeats(value)).toThrow(
      "MIRAIO_JEV_REPEATS",
    );
  });
});

describe("summarizeJevShadowRuns", () => {
  it("reports confidence and latency distributions", () => {
    const summary = summarizeJevShadowRuns(runs);

    expect(summary.confidence_overall).toMatchObject({
      count: 4,
      max: 0.6,
      min: 0.4,
    });
    expect(summary.confidence_overall.mean).toBeCloseTo(0.5125);
    expect(summary.evaluation_latency_ms.flash_brief).toMatchObject({
      count: 2,
      max: 120,
      min: 100,
    });
    expect(summary.run_latency_ms).toMatchObject({
      count: 2,
      max: 360,
      min: 300,
    });
  });

  it("defines modal disagreement as rounded expectation differing from the modal level", () => {
    const summary = summarizeJevShadowRuns(runs);

    expect(summary.modal_expected_disagreement).toEqual({
      count: 1,
      definition: "Math.round(expected_score) !== modal_level",
      rate: 0.5,
      total: 2,
    });
  });

  it("records same-case repeat spans and selection stability", () => {
    const summary = summarizeJevShadowRuns(runs);
    const quality = summary.repeat_variation.find(
      (entry) => entry.question_id === "quality",
    );
    const selection = summary.repeat_variation.find(
      (entry) => entry.question_id === "selection",
    );

    expect(quality?.confidence).toMatchObject({ min: 0.4, max: 0.5 });
    expect(quality?.confidence?.span).toBeCloseTo(0.1);
    expect(quality?.expected_score).toMatchObject({
      min: 4.4,
      max: 4.4,
      span: 0,
    });
    expect(selection?.selected_values).toEqual(["a"]);
  });
});

describe("compareJevShadowReports", () => {
  it("stores summary deltas against the previous report", () => {
    const currentSummary = summarizeJevShadowRuns(runs);
    const previousSummary = {
      ...currentSummary,
      confidence_overall: {
        ...currentSummary.confidence_overall,
        mean: 0.4,
      },
      run_latency_ms: { ...currentSummary.run_latency_ms, p95: 400 },
    };
    const previous = {
      generated_at: "2026-09-22T00:00:00.000Z",
      summary: previousSummary,
    } as JevShadowReport;

    const comparison = compareJevShadowReports(currentSummary, previous);

    expect(comparison).toMatchObject({
      modal_expected_disagreement_rate_delta: 0,
      previous_generated_at: "2026-09-22T00:00:00.000Z",
      run_latency_p95_ms_delta: -40,
    });
    expect(comparison?.confidence_mean_delta).toBeCloseTo(0.1125);
  });
});
