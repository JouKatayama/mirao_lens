import type { MutualValueInput, MutualValuePublic } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import {
  DecisionEvaluatorError,
  type DecisionAnswer,
  type DecisionEvaluationResult,
  type DecisionEvaluator,
} from "./decision-evaluator";
import {
  mutualValueClaimRule,
  mutualValueClaimTypeDescriptions,
  mutualValueFactProposition,
} from "./mutual-value-claim-rubric";
import {
  buildMutualValueClaimShadowEvaluationQuestions,
  buildMutualValueClaimShadowEvaluationRequest,
  buildMutualValueClaimShadowEvaluationState,
  evaluateMutualValueClaimsInShadow,
  toMutualValueClaimId,
} from "./mutual-value-claim-shadow-evaluation";
import { JevDecisionEvaluator } from "./providers/jev-decision-evaluator";

/** Invented card and context data, per AGENTS.md. */

const input: MutualValueInput = {
  card: {
    company: "架空精密工業株式会社",
    department: "情報システム課",
    email: "sato.kenichi@kakuu-seimitsu.invalid",
    language: "ja",
    name: "佐藤 健一",
    phone: "03-0000-0000",
    title: "課長",
    website: "https://kakuu-seimitsu.invalid",
  },
  flash_brief: {
    potential: "現場の在庫管理課題に直接関わる立場である可能性が高い。",
    say_this: ["現在の在庫管理はどのように運用されていますか？"],
    who: "架空精密工業の情報システム課長。",
    why_you: "製造業向け在庫管理SaaSの提案経験が噛み合う可能性がある。",
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
    ],
  },
};

const mutualValue: MutualValuePublic = {
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
      text: "現場の在庫差異を減らす設計の相談に乗れる。",
    },
  ],
  next_action: {
    action: "在庫運用の現状について30分の打ち合わせを打診する。",
    reason: "課題の所在を早く特定できるため。",
    timing: "今週中",
  },
};

const request = { input, mutualValue };

function booleanAnswer(id: string, probability: number): DecisionAnswer {
  return { id, probability, type: "boolean" };
}

function evaluatorReturning(probability: number) {
  return {
    async evaluate(
      evaluationRequest: Parameters<DecisionEvaluator["evaluate"]>[0],
    ): Promise<DecisionEvaluationResult> {
      return {
        answers: evaluationRequest.questions.map((question) =>
          booleanAnswer(question.id, probability),
        ),
      };
    },
  } satisfies DecisionEvaluator;
}

describe("mutual value claim rubric", () => {
  it("reproduces the prompt rule it was extracted from, byte for byte", () => {
    expect(mutualValueClaimRule)
      .toBe(`- Distinguish facts (grounded in card data or explicit user context) from
  hypotheses (inferred or assumed). Use claim_type accordingly.`);
  });

  it("puts the same two definitions in front of the evaluator", () => {
    expect(mutualValueFactProposition).toContain(
      mutualValueClaimTypeDescriptions.fact,
    );
    expect(mutualValueFactProposition).toContain(
      mutualValueClaimTypeDescriptions.hypothesis,
    );
  });

  it("drops the schema-filling instruction the evaluator has no use for", () => {
    expect(mutualValueClaimRule).toContain("Use claim_type accordingly");
    expect(mutualValueFactProposition).not.toContain("claim_type");
  });
});

describe("mutual value claim shadow evaluation state", () => {
  const state = buildMutualValueClaimShadowEvaluationState(request);

  it("never shows the evaluator the labels it is being asked to reproduce", () => {
    const serialized = JSON.stringify(state);

    expect(serialized).not.toContain("claim_type");
    expect(serialized).not.toContain("hypothesis");
  });

  it("sends every give and get claim under a stable id", () => {
    expect(state["claims"]).toEqual([
      {
        id: "give_1",
        section: "give",
        text: "製造業向け在庫管理SaaSの導入提案の経験を共有できる。",
      },
      {
        id: "give_2",
        section: "give",
        text: "現場の在庫差異を減らす設計の相談に乗れる。",
      },
      {
        id: "get_1",
        section: "get",
        text: "製造現場での在庫運用の実態を知ることができる。",
      },
    ]);
  });

  it("never carries a way to contact anybody", () => {
    const serialized = JSON.stringify(state);

    for (const secret of [
      "sato.kenichi@kakuu-seimitsu.invalid",
      "03-0000-0000",
      "https://kakuu-seimitsu.invalid",
      "佐藤 健一",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe("mutual value claim shadow evaluation questions", () => {
  it("asks one proposition per claim", () => {
    const questions = buildMutualValueClaimShadowEvaluationQuestions(request);

    expect(questions.map((question) => question.id)).toEqual([
      "give_1",
      "give_2",
      "get_1",
    ]);

    for (const question of questions) {
      expect(question.type).toBe("boolean");
    }
  });

  it("refuses a mutual value with a section it cannot evaluate", () => {
    expect(() =>
      buildMutualValueClaimShadowEvaluationRequest({
        ...request,
        mutualValue: { ...mutualValue, get: [] },
      }),
    ).toThrow(DecisionEvaluatorError);
  });
});

describe("mutual value claim shadow evaluation result", () => {
  it("pairs each probability with the label the generator chose", async () => {
    const evaluation = await evaluateMutualValueClaimsInShadow(
      evaluatorReturning(0.31),
      request,
    );

    expect(evaluation.items).toEqual([
      {
        factProbability: 0.31,
        generatorClaimType: "fact",
        id: "give_1",
        index: 0,
        section: "give",
      },
      {
        factProbability: 0.31,
        generatorClaimType: "hypothesis",
        id: "give_2",
        index: 1,
        section: "give",
      },
      {
        factProbability: 0.31,
        generatorClaimType: "hypothesis",
        id: "get_1",
        index: 0,
        section: "get",
      },
    ]);
  });

  it("crosses no threshold, so a 0.31 fact stays labelled a fact", async () => {
    // The disagreement is the output. Relabelling `give_1` here would be this
    // module making a product decision about what counts as grounded.
    const evaluation = await evaluateMutualValueClaimsInShadow(
      evaluatorReturning(0.31),
      request,
    );

    expect(evaluation.items[0]?.generatorClaimType).toBe("fact");
  });

  it("does not change the mutual value it was given", async () => {
    const before = JSON.stringify(mutualValue);

    await evaluateMutualValueClaimsInShadow(evaluatorReturning(0.9), request);

    expect(JSON.stringify(mutualValue)).toBe(before);
  });

  it("reads a Jev response end to end", async () => {
    const evaluator = new JevDecisionEvaluator({
      request: async ({ questions }) => ({
        answers: Object.fromEntries(
          Object.keys(questions).map((name) => [
            name,
            { noul: name === "give_1" ? 0.92 : 0.27, type: "noul" },
          ]),
        ),
      }),
    });

    const evaluation = await evaluateMutualValueClaimsInShadow(
      evaluator,
      request,
    );

    expect(evaluation.items[0]?.factProbability).toBe(0.92);
    expect(evaluation.items[1]?.factProbability).toBe(0.27);
  });

  it("refuses a result that skipped a claim", async () => {
    const evaluator = {
      async evaluate(): Promise<DecisionEvaluationResult> {
        return {
          answers: [booleanAnswer(toMutualValueClaimId("give", 0), 0.5)],
        };
      },
    } satisfies DecisionEvaluator;

    await expect(
      evaluateMutualValueClaimsInShadow(evaluator, request),
    ).rejects.toBeInstanceOf(DecisionEvaluatorError);
  });
});
