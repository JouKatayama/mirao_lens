import type {
  FlashBriefInput,
  FlashBriefPublic,
  MutualValueInput,
  MutualValuePublic,
} from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  expectedDecisionScore,
  type DecisionEvaluationRequest,
  type DecisionScoreQuestion,
} from "../decision-evaluator";
import { evaluateIdentityStatusInShadow } from "../identity-status-shadow-evaluation";
import { evaluateMutualValueClaimsInShadow } from "../mutual-value-claim-shadow-evaluation";
import { evaluatePotentialScoreInShadow } from "../potential-score-shadow-evaluation";
import { JevDecisionEvaluator } from "./jev-decision-evaluator";

/**
 * One real call to Jev, opt-in and billed to whoever runs it.
 *
 *   MIRAIO_RUN_JEV_SMOKE=1 \
 *   TYPESAFE_API_KEY=<key> \
 *   pnpm --filter @miraio/ai exec vitest run src/providers/jev-decision-evaluator.smoke.test.ts
 *
 * Two gates, both required, so `pnpm test` on a developer machine that happens
 * to have a key exported cannot reach the network by accident: the flag says a
 * human meant it, and the key says the call can succeed. Without both this
 * file registers no tests at all.
 *
 * It asserts the contract and prints the latency. It asserts no quality
 * threshold — what a good score is here is unknown until human scoring says
 * so, which is the same order ADR-0005 imposes everywhere else — and it uses
 * invented state, because a smoke test is not a place for real card data.
 */

const runSmoke =
  process.env.MIRAIO_RUN_JEV_SMOKE === "1" &&
  Boolean(process.env.TYPESAFE_API_KEY?.trim());

const severity: DecisionScoreQuestion = {
  id: "severity",
  levels: [1, 2, 3],
  prompt: `How severe is the reported issue? 1 = cosmetic, 2 = a feature is
degraded but a workaround exists, 3 = blocking with no workaround.`,
  type: "score",
};

const request: DecisionEvaluationRequest = {
  questions: [
    {
      id: "category",
      options: ["billing", "technical", "other"],
      prompt: "Which team should handle this report?",
      type: "choice",
    },
    severity,
    {
      id: "urgent",
      prompt: "The reporter is blocked right now.",
      type: "boolean",
    },
  ],
  state: {
    report: "Checkout returns a 500 for every card. Nobody can pay.",
  },
};

describe.runIf(runSmoke)("jev decision evaluator smoke", () => {
  it("answers all three question types in one pass", async () => {
    const evaluator = new JevDecisionEvaluator({
      apiKey: process.env.TYPESAFE_API_KEY,
      ...(process.env.AI_DECISION_MODEL
        ? { model: process.env.AI_DECISION_MODEL }
        : {}),
    });

    const startedAt = Date.now();
    const result = await evaluator.evaluate(request);
    const elapsedMilliseconds = Date.now() - startedAt;

    const [category, score, urgent] = result.answers;

    if (
      category?.type !== "choice" ||
      score?.type !== "score" ||
      urgent?.type !== "boolean"
    ) {
      throw new Error("expected one answer per question, in order");
    }

    expect(request.questions[0]).toMatchObject({ type: "choice" });
    expect(severity.levels).toContain(score.score);
    expect(urgent.probability).toBeGreaterThanOrEqual(0);
    expect(urgent.probability).toBeLessThanOrEqual(1);

    // A noul carries no verdict and no confidence, and the adapter must not
    // have invented either. This is the mismatch worth catching against the
    // live API rather than only against a fixture.
    expect(urgent.holds).toBeUndefined();
    expect(urgent.confidence).toBeUndefined();

    // The number the next production decision depends on.
    console.info(
      `[jev smoke] latency=${elapsedMilliseconds}ms choice=${category.choice} ` +
        `confidence=${category.confidence} modal_level=${score.score} ` +
        `expected_score=${expectedDecisionScore(severity, score).toFixed(2)} ` +
        `urgent_probability=${urgent.probability}`,
    );
  });
});

/** Invented card and context data, per AGENTS.md. */
const potentialInput: FlashBriefInput = {
  card: {
    company: "架空精密工業株式会社",
    department: "情報システム課",
    email: null,
    language: "ja",
    name: "佐藤 健一",
    phone: null,
    title: "課長",
    website: null,
  },
  locale: "ja",
  meeting_goal: "sales",
  personal_context: {
    current_company: "架空クラウド株式会社",
    current_role: "法人営業",
    items: [
      {
        tags: ["SaaS"],
        text: "製造業向け在庫管理SaaSの導入提案を担当している",
        type: "expertise",
      },
      {
        tags: ["製造業"],
        text: "現場の在庫差異をなくす案件を探している",
        type: "seeking",
      },
    ],
  },
};

const potentialBrief: FlashBriefPublic = {
  connection_keywords: ["在庫管理", "製造業"],
  identity_status: "medium_confidence",
  potential: "現場の在庫管理課題に直接関わる立場である可能性が高い。",
  potential_score: 4,
  say_this: ["現在の在庫管理はどのように運用されていますか？"],
  who: "架空精密工業の情報システム課長。",
  why_you: "製造業向け在庫管理SaaSの提案経験が課題に噛み合う可能性がある。",
  why_you_claim_type: "hypothesis",
};

describe.runIf(runSmoke)("potential score shadow evaluation smoke", () => {
  it("rates POTENTIAL against the generator's own rubric", async () => {
    const evaluator = new JevDecisionEvaluator({
      apiKey: process.env.TYPESAFE_API_KEY,
      ...(process.env.AI_DECISION_MODEL
        ? { model: process.env.AI_DECISION_MODEL }
        : {}),
    });

    const startedAt = Date.now();
    const evaluation = await evaluatePotentialScoreInShadow(evaluator, {
      brief: potentialBrief,
      input: potentialInput,
    });
    const elapsedMilliseconds = Date.now() - startedAt;

    // No threshold. The two scores are reported, never compared to a bar.
    expect(evaluation.generatorScore).toBe(potentialBrief.potential_score);
    expect([1, 2, 3, 4, 5]).toContain(evaluation.modalScore);

    console.info(
      `[jev potential] latency=${elapsedMilliseconds}ms ` +
        `generator=${evaluation.generatorScore} ` +
        `modal=${evaluation.modalScore} ` +
        `expected=${evaluation.expectedScore.toFixed(2)} ` +
        `confidence=${evaluation.confidence} ` +
        `distribution=${JSON.stringify(evaluation.probabilities)}`,
    );
  });
});

function smokeEvaluator(): JevDecisionEvaluator {
  return new JevDecisionEvaluator({
    apiKey: process.env.TYPESAFE_API_KEY,
    ...(process.env.AI_DECISION_MODEL
      ? { model: process.env.AI_DECISION_MODEL }
      : {}),
  });
}

describe.runIf(runSmoke)("identity status shadow evaluation smoke", () => {
  it("assesses identity against the generator's own four definitions", async () => {
    const startedAt = Date.now();
    const evaluation = await evaluateIdentityStatusInShadow(smokeEvaluator(), {
      brief: potentialBrief,
      input: potentialInput,
    });
    const elapsedMilliseconds = Date.now() - startedAt;

    expect(evaluation.generatorStatus).toBe(potentialBrief.identity_status);

    // No assertion on `verified`. The prompt forbids it, and whether Jev puts
    // mass there anyway is the thing being measured, not a pass condition.
    console.info(
      `[jev identity] latency=${elapsedMilliseconds}ms ` +
        `generator=${evaluation.generatorStatus} ` +
        `modal=${evaluation.modalStatus} ` +
        `confidence=${evaluation.confidence} ` +
        `distribution=${JSON.stringify(evaluation.probabilities)}`,
    );
  });
});

const claimInput: MutualValueInput = {
  card: potentialInput.card,
  flash_brief: {
    potential: potentialBrief.potential,
    say_this: [...potentialBrief.say_this],
    who: potentialBrief.who,
    why_you: potentialBrief.why_you,
  },
  locale: potentialInput.locale,
  meeting_goal: potentialInput.meeting_goal,
  personal_context: potentialInput.personal_context,
};

const claimMutualValue: MutualValuePublic = {
  ask: [
    {
      question: "在庫差異はどの工程で起きていますか？",
      validates_hypothesis: null,
    },
  ],
  bridge: "在庫管理という同じ課題の両側にいる。",
  get: [
    {
      claim_type: "hypothesis",
      evidence_ids: [],
      text: "製造現場での在庫運用の実態を知ることができる。",
    },
  ],
  give: [
    {
      claim_type: "fact",
      evidence_ids: [],
      text: "製造業向け在庫管理SaaSの導入提案の経験を共有できる。",
    },
    {
      claim_type: "hypothesis",
      evidence_ids: [],
      text: "相手の工場では複数拠点の在庫が日次で合っていないはずだ。",
    },
  ],
  next_action: {
    action: "在庫運用の現状について30分の打ち合わせを打診する。",
    reason: "課題の所在を早く特定できるため。",
    timing: "今週中",
  },
};

describe.runIf(runSmoke)("mutual value claim shadow evaluation smoke", () => {
  it("rates how grounded each claim is", async () => {
    const startedAt = Date.now();
    const evaluation = await evaluateMutualValueClaimsInShadow(
      smokeEvaluator(),
      { input: claimInput, mutualValue: claimMutualValue },
    );
    const elapsedMilliseconds = Date.now() - startedAt;

    expect(evaluation.items).toHaveLength(3);

    // give_1 restates the user's own Personal Context; give_2 asserts a fact
    // about the other company that nothing supports. If the probabilities do
    // not separate those two, the proposition is not doing its job.
    const summary = evaluation.items
      .map(
        (item) =>
          `${item.id}(${item.generatorClaimType})=${item.factProbability}`,
      )
      .join(" ");

    console.info(`[jev claims] latency=${elapsedMilliseconds}ms ${summary}`);
  });
});
