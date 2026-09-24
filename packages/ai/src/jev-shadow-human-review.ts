import type {
  DecisionEvaluationRequest,
  DecisionQuestion,
  DecisionState,
} from "./decision-evaluator";
import type {
  JevShadowAnswer,
  JevShadowEvaluationName,
  JevShadowRun,
} from "./jev-shadow-report";

export type HumanAnswer = string | number | boolean | null;
export type HumanQuestion = Readonly<{
  question: DecisionQuestion;
  human_answer: HumanAnswer;
}>;
export type HumanTemplate = Readonly<{
  schema_version: 1;
  cases: readonly Readonly<{
    case_name: string;
    evaluations: readonly Readonly<{
      evaluation: JevShadowEvaluationName;
      state: DecisionState;
      questions: readonly HumanQuestion[];
    }>[];
  }>[];
}>;
export type HumanRequest = Readonly<{
  case_name: string;
  evaluation: JevShadowEvaluationName;
  request: DecisionEvaluationRequest;
}>;

function key(caseName: string, evaluation: string, questionId: string): string {
  return JSON.stringify([caseName, evaluation, questionId]);
}

export function makeJevHumanTemplate(
  requests: readonly HumanRequest[],
): HumanTemplate {
  const cases = new Map<
    string,
    {
      case_name: string;
      evaluations: {
        evaluation: JevShadowEvaluationName;
        state: DecisionState;
        questions: HumanQuestion[];
      }[];
    }
  >();
  const seen = new Set<string>();

  for (const { case_name, evaluation, request } of requests) {
    const entry = cases.get(case_name) ?? { case_name, evaluations: [] };
    for (const question of request.questions) {
      const id = key(case_name, evaluation, question.id);
      if (seen.has(id))
        throw new Error(`Duplicate human review question: ${id}`);
      seen.add(id);
    }
    entry.evaluations.push({
      evaluation,
      state: request.state,
      questions: request.questions.map((question) => ({
        question,
        human_answer: null,
      })),
    });
    cases.set(case_name, entry);
  }

  return { schema_version: 1, cases: [...cases.values()] };
}

export function assertJevHumanTemplateMatches(
  reference: HumanTemplate,
  candidate: HumanTemplate,
): void {
  const stripAnswers = (template: HumanTemplate): unknown =>
    template.cases.map((caseEntry) => ({
      case_name: caseEntry.case_name,
      evaluations: caseEntry.evaluations.map((evaluation) => ({
        evaluation: evaluation.evaluation,
        state: evaluation.state,
        questions: evaluation.questions.map((item) => item.question),
      })),
    }));
  if (
    candidate.schema_version !== 1 ||
    JSON.stringify(stripAnswers(reference)) !==
      JSON.stringify(stripAnswers(candidate))
  ) {
    throw new Error(
      "Human anchor questions or shadow state differ from current fixtures. Regenerate the template before scoring.",
    );
  }
}

type Detail = Readonly<{
  case_name: string;
  evaluation: JevShadowEvaluationName;
  question_id: string;
  type: DecisionQuestion["type"];
  human_answer: Exclude<HumanAnswer, null>;
  repeats: number;
  jev_selected?: string | null;
  jev_expected_score?: number;
  jev_modal_level?: number | null;
  jev_probability?: number;
  human_option_probability?: number;
  abstain_question?: boolean;
  exact_agreement?: boolean | null;
  absolute_error?: number;
  brier?: number;
}>;

export type JevHumanReview = Readonly<{
  anchor_fingerprint: string;
  coverage: Readonly<{ labeled: number; total: number }>;
  choice: Readonly<{
    count: number;
    decisive_count: number;
    exact_agreement: number | null;
    mean_human_option_probability: number | null;
  }>;
  abstain: Readonly<{
    count: number;
    human_abstain: number;
    jev_abstain: number;
    exact_agreement: number | null;
  }>;
  score: Readonly<{
    count: number;
    modal_decisive_count: number;
    expected_mae: number | null;
    modal_exact_agreement: number | null;
  }>;
  boolean: Readonly<{ count: number; brier: number | null }>;
  details: readonly Detail[];
}>;

function mean(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function mode<T extends string | number>(values: readonly T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const highest = Math.max(...counts.values());
  const winners = [...counts].filter(([, count]) => count === highest);
  return winners.length === 1 ? winners[0]![0] : null;
}

function assertHumanAnswer(
  question: DecisionQuestion,
  value: HumanAnswer,
): void {
  if (value === null) return;
  const valid =
    question.type === "choice"
      ? typeof value === "string" && question.options.includes(value)
      : question.type === "score"
        ? typeof value === "number" && question.levels.includes(value)
        : typeof value === "boolean";
  if (!valid)
    throw new Error(
      `Invalid human answer for ${question.id}: ${String(value)}`,
    );
}

export function compareJevShadowToHuman(
  runs: readonly JevShadowRun[],
  template: HumanTemplate,
): JevHumanReview {
  if (template.schema_version !== 1)
    throw new Error("Unsupported human review schema version.");
  const grouped = new Map<string, JevShadowAnswer[]>();
  for (const run of runs)
    for (const evaluation of run.evaluations)
      for (const answer of evaluation.answers) {
        const id = key(
          run.case_name,
          evaluation.evaluation,
          answer.question_id,
        );
        grouped.set(id, [...(grouped.get(id) ?? []), answer]);
      }

  const seen = new Set<string>();
  const labels: string[] = [];
  const details: Detail[] = [];
  for (const caseEntry of template.cases)
    for (const evaluation of caseEntry.evaluations)
      for (const item of evaluation.questions) {
        const { question, human_answer } = item;
        const id = key(caseEntry.case_name, evaluation.evaluation, question.id);
        if (seen.has(id))
          throw new Error(`Duplicate human review question: ${id}`);
        seen.add(id);
        const answers = grouped.get(id);
        if (
          !answers?.length ||
          answers.some((answer) => answer.type !== question.type)
        ) {
          throw new Error(
            `Human review question does not match Jev report: ${id}`,
          );
        }
        assertHumanAnswer(question, human_answer);
        if (human_answer === null) continue;
        labels.push(JSON.stringify([id, human_answer]));
        const base = {
          case_name: caseEntry.case_name,
          evaluation: evaluation.evaluation,
          question_id: question.id,
          type: question.type,
          human_answer,
          repeats: answers.length,
        };
        if (question.type === "choice" && typeof human_answer === "string") {
          const choices = answers.filter(
            (answer): answer is Extract<JevShadowAnswer, { type: "choice" }> =>
              answer.type === "choice",
          );
          if (
            choices.some(
              (answer) =>
                Object.keys(answer.probabilities).length !==
                  question.options.length ||
                question.options.some(
                  (option) => answer.probabilities[option] === undefined,
                ),
            )
          )
            throw new Error(`Choice options changed: ${id}`);
          const selected = mode(choices.map((answer) => answer.selected));
          details.push({
            ...base,
            type: "choice",
            human_answer,
            jev_selected: selected,
            abstain_question: question.options.includes("abstain"),
            human_option_probability:
              mean(
                choices.map(
                  (answer) => answer.probabilities[human_answer] ?? 0,
                ),
              ) ?? 0,
            exact_agreement:
              selected === null ? null : selected === human_answer,
          });
        } else if (
          question.type === "score" &&
          typeof human_answer === "number"
        ) {
          const scores = answers.filter(
            (answer): answer is Extract<JevShadowAnswer, { type: "score" }> =>
              answer.type === "score",
          );
          if (
            scores.some(
              (answer) =>
                Object.keys(answer.probabilities).length !==
                  question.levels.length ||
                question.levels.some(
                  (level) => answer.probabilities[String(level)] === undefined,
                ),
            )
          )
            throw new Error(`Score levels changed: ${id}`);
          const expected =
            mean(scores.map((answer) => answer.expected_score)) ?? 0;
          const modal = mode(scores.map((answer) => answer.modal_level));
          details.push({
            ...base,
            type: "score",
            human_answer,
            jev_expected_score: expected,
            jev_modal_level: modal,
            absolute_error: Math.abs(expected - human_answer),
            exact_agreement: modal === null ? null : modal === human_answer,
          });
        } else if (
          question.type === "boolean" &&
          typeof human_answer === "boolean"
        ) {
          const probabilities = answers
            .filter(
              (
                answer,
              ): answer is Extract<JevShadowAnswer, { type: "boolean" }> =>
                answer.type === "boolean",
            )
            .map((answer) => answer.probability);
          const probability = mean(probabilities) ?? 0;
          details.push({
            ...base,
            type: "boolean",
            human_answer,
            jev_probability: probability,
            brier: (probability - Number(human_answer)) ** 2,
          });
        }
      }
  if (seen.size !== grouped.size)
    throw new Error(
      "Human review template does not cover every Jev report question.",
    );
  const choices = details.filter((detail) => detail.type === "choice");
  const scores = details.filter((detail) => detail.type === "score");
  const booleans = details.filter((detail) => detail.type === "boolean");
  const choiceAgreement = choices.filter(
    (detail) => detail.exact_agreement !== null,
  );
  const scoreAgreement = scores.filter(
    (detail) => detail.exact_agreement !== null,
  );
  const abstain = choices.filter((detail) => detail.abstain_question);
  const abstainAgreement = abstain.filter(
    (detail) => detail.exact_agreement !== null,
  );
  return {
    anchor_fingerprint: JSON.stringify({
      questions: [...seen].sort(),
      labels: labels.sort(),
    }),
    coverage: { labeled: details.length, total: seen.size },
    choice: {
      count: choices.length,
      decisive_count: choiceAgreement.length,
      exact_agreement: mean(
        choiceAgreement.map((detail) => Number(detail.exact_agreement)),
      ),
      mean_human_option_probability: mean(
        choices.map((detail) => detail.human_option_probability ?? 0),
      ),
    },
    abstain: {
      count: abstain.length,
      human_abstain: abstain.filter(
        (detail) => detail.human_answer === "abstain",
      ).length,
      jev_abstain: abstain.filter((detail) => detail.jev_selected === "abstain")
        .length,
      exact_agreement: mean(
        abstainAgreement.map((detail) => Number(detail.exact_agreement)),
      ),
    },
    score: {
      count: scores.length,
      modal_decisive_count: scoreAgreement.length,
      expected_mae: mean(scores.map((detail) => detail.absolute_error ?? 0)),
      modal_exact_agreement: mean(
        scoreAgreement.map((detail) => Number(detail.exact_agreement)),
      ),
    },
    boolean: {
      count: booleans.length,
      brier: mean(booleans.map((detail) => detail.brier ?? 0)),
    },
    details,
  };
}

export function compareJevHumanReviews(
  current: JevHumanReview,
  previous: JevHumanReview,
):
  | Readonly<{ comparable: false; reason: "human_labels_changed" }>
  | Readonly<{
      comparable: true;
      choice_agreement_delta: number | null;
      score_expected_mae_delta: number | null;
      boolean_brier_delta: number | null;
    }> {
  if (current.anchor_fingerprint !== previous.anchor_fingerprint)
    return { comparable: false, reason: "human_labels_changed" };
  const delta = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : a - b;
  return {
    comparable: true,
    choice_agreement_delta: delta(
      current.choice.exact_agreement,
      previous.choice.exact_agreement,
    ),
    score_expected_mae_delta: delta(
      current.score.expected_mae,
      previous.score.expected_mae,
    ),
    boolean_brier_delta: delta(current.boolean.brier, previous.boolean.brier),
  };
}
