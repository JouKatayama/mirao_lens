export const jevShadowEvaluationNames = [
  "flash_brief",
  "say_this",
  "potential_score",
  "identity_status",
  "mutual_value_claims",
] as const;

export type JevShadowEvaluationName =
  (typeof jevShadowEvaluationNames)[number];

export type JevShadowChoiceAnswer = Readonly<{
  confidence: number;
  probabilities: Readonly<Record<string, number>>;
  question_id: string;
  selected: string;
  type: "choice";
}>;

export type JevShadowScoreAnswer = Readonly<{
  confidence: number;
  expected_score: number;
  modal_level: number;
  probabilities: Readonly<Record<string, number>>;
  question_id: string;
  type: "score";
}>;

export type JevShadowBooleanAnswer = Readonly<{
  probability: number;
  question_id: string;
  type: "boolean";
}>;

export type JevShadowAnswer =
  | JevShadowBooleanAnswer
  | JevShadowChoiceAnswer
  | JevShadowScoreAnswer;

export type JevShadowEvaluationRun = Readonly<{
  answers: readonly JevShadowAnswer[];
  evaluation: JevShadowEvaluationName;
  latency_ms: number;
}>;

export type JevShadowRun = Readonly<{
  case_name: string;
  evaluations: readonly JevShadowEvaluationRun[];
  repeat: number;
  total_latency_ms: number;
}>;

export type NumericSummary = Readonly<{
  count: number;
  max: number;
  mean: number;
  min: number;
  p50: number;
  p95: number;
  span: number;
}>;

export type JevShadowRepeatVariation = Readonly<{
  case_name: string;
  confidence?: NumericSummary;
  evaluation: JevShadowEvaluationName;
  expected_score?: NumericSummary;
  probability?: NumericSummary;
  question_id: string;
  selected_values?: readonly string[];
}>;

export type JevShadowSummary = Readonly<{
  confidence_by_evaluation: Readonly<
    Partial<Record<JevShadowEvaluationName, NumericSummary>>
  >;
  confidence_overall: NumericSummary;
  evaluation_latency_ms: Readonly<
    Partial<Record<JevShadowEvaluationName, NumericSummary>>
  >;
  modal_expected_disagreement: Readonly<{
    count: number;
    definition: "Math.round(expected_score) !== modal_level";
    rate: number;
    total: number;
  }>;
  repeat_variation: readonly JevShadowRepeatVariation[];
  run_latency_ms: NumericSummary;
}>;

export type JevShadowReportComparison = Readonly<{
  confidence_mean_delta: number;
  modal_expected_disagreement_rate_delta: number;
  previous_generated_at: string;
  run_latency_p95_ms_delta: number;
}>;

export type JevShadowReport = Readonly<{
  case_count: number;
  comparison_to_previous: JevShadowReportComparison | null;
  generated_at: string;
  model: string;
  provider: "typesafe/jev";
  repeats: number;
  runs: readonly JevShadowRun[];
  schema_version: 1;
  summary: JevShadowSummary;
}>;

export function parseJevShadowRepeats(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 1;

  const repeats = Number(value);

  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    throw new Error("MIRAIO_JEV_REPEATS must be a positive integer.");
  }

  return repeats;
}

function numericSummary(values: readonly number[]): NumericSummary {
  if (values.length === 0) {
    return { count: 0, max: 0, mean: 0, min: 0, p50: 0, p95: 0, span: 0 };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const min = sorted[0] ?? 0;
  const max = sorted.at(-1) ?? 0;
  const percentile = (fraction: number): number =>
    sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0;

  return {
    count: sorted.length,
    max,
    mean: sorted.reduce((sum, current) => sum + current, 0) / sorted.length,
    min,
    p50: percentile(0.5),
    p95: percentile(0.95),
    span: max - min,
  };
}

type AnswerWithContext = Readonly<{
  answer: JevShadowAnswer;
  caseName: string;
  evaluation: JevShadowEvaluationName;
}>;

function answersWithContext(runs: readonly JevShadowRun[]): AnswerWithContext[] {
  return runs.flatMap((run) =>
    run.evaluations.flatMap((evaluation) =>
      evaluation.answers.map((answer) => ({
        answer,
        caseName: run.case_name,
        evaluation: evaluation.evaluation,
      })),
    ),
  );
}

export function summarizeJevShadowRuns(
  runs: readonly JevShadowRun[],
): JevShadowSummary {
  const answers = answersWithContext(runs);
  const confidenceValues = answers.flatMap(({ answer }) =>
    answer.type === "boolean" ? [] : [answer.confidence],
  );
  const confidenceByEvaluation: Partial<
    Record<JevShadowEvaluationName, NumericSummary>
  > = {};
  const evaluationLatency: Partial<
    Record<JevShadowEvaluationName, NumericSummary>
  > = {};

  for (const evaluationName of jevShadowEvaluationNames) {
    const confidences = answers.flatMap(({ answer, evaluation }) =>
      evaluation === evaluationName && answer.type !== "boolean"
        ? [answer.confidence]
        : [],
    );
    const latencies = runs.flatMap((run) =>
      run.evaluations.flatMap((evaluation) =>
        evaluation.evaluation === evaluationName
          ? [evaluation.latency_ms]
          : [],
      ),
    );

    if (confidences.length > 0) {
      confidenceByEvaluation[evaluationName] =
        numericSummary(confidences);
    }

    if (latencies.length > 0) {
      evaluationLatency[evaluationName] = numericSummary(latencies);
    }
  }

  const scoreAnswers = answers.flatMap(({ answer }) =>
    answer.type === "score" ? [answer] : [],
  );
  const disagreementCount = scoreAnswers.filter(
    (answer) => Math.round(answer.expected_score) !== answer.modal_level,
  ).length;
  const grouped = new Map<string, AnswerWithContext[]>();

  for (const entry of answers) {
    const key = `${entry.caseName}\u0000${entry.evaluation}\u0000${entry.answer.question_id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  const repeatVariation = [...grouped.values()]
    .map((entries): JevShadowRepeatVariation => {
      const first = entries[0];

      if (!first) {
        throw new Error("Cannot summarize an empty answer group.");
      }

      const confidences = entries.flatMap(({ answer }) =>
        answer.type === "boolean" ? [] : [answer.confidence],
      );
      const expectedScores = entries.flatMap(({ answer }) =>
        answer.type === "score" ? [answer.expected_score] : [],
      );
      const probabilities = entries.flatMap(({ answer }) =>
        answer.type === "boolean" ? [answer.probability] : [],
      );
      const selectedValues = [
        ...new Set(
          entries.flatMap(({ answer }) =>
            answer.type === "choice" ? [answer.selected] : [],
          ),
        ),
      ].sort();

      return {
        case_name: first.caseName,
        ...(confidences.length > 0
          ? { confidence: numericSummary(confidences) }
          : {}),
        evaluation: first.evaluation,
        ...(expectedScores.length > 0
          ? { expected_score: numericSummary(expectedScores) }
          : {}),
        ...(probabilities.length > 0
          ? { probability: numericSummary(probabilities) }
          : {}),
        question_id: first.answer.question_id,
        ...(selectedValues.length > 0 ? { selected_values: selectedValues } : {}),
      };
    })
    .sort((left, right) =>
      `${left.case_name}/${left.evaluation}/${left.question_id}`.localeCompare(
        `${right.case_name}/${right.evaluation}/${right.question_id}`,
      ),
    );

  return {
    confidence_by_evaluation: confidenceByEvaluation,
    confidence_overall: numericSummary(confidenceValues),
    evaluation_latency_ms: evaluationLatency,
    modal_expected_disagreement: {
      count: disagreementCount,
      definition: "Math.round(expected_score) !== modal_level",
      rate:
        scoreAnswers.length === 0
          ? 0
          : disagreementCount / scoreAnswers.length,
      total: scoreAnswers.length,
    },
    repeat_variation: repeatVariation,
    run_latency_ms: numericSummary(runs.map((run) => run.total_latency_ms)),
  };
}

export function compareJevShadowReports(
  current: JevShadowSummary,
  previous: JevShadowReport | null,
): JevShadowReportComparison | null {
  if (!previous) return null;

  return {
    confidence_mean_delta:
      current.confidence_overall.mean -
      previous.summary.confidence_overall.mean,
    modal_expected_disagreement_rate_delta:
      current.modal_expected_disagreement.rate -
      previous.summary.modal_expected_disagreement.rate,
    previous_generated_at: previous.generated_at,
    run_latency_p95_ms_delta:
      current.run_latency_ms.p95 - previous.summary.run_latency_ms.p95,
  };
}
