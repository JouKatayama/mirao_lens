import type { FlashBriefInput, FlashBriefPublic } from "@miraio/domain";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { classifyProviderFailure } from "./provider-error";
import {
  createOpenAIClient,
  toReasoningParameter,
  type ReasoningEffort,
} from "./provider-client";

/**
 * The reviewing expert: scores a generated Flash Brief on the product's eight
 * rubric dimensions and says what is wrong with it.
 *
 * This is evaluation machinery, not a product stage. It is deliberately absent
 * from `index.ts` so it cannot drift into the request path: the card pipeline
 * runs inside a 60-second route budget and pays per call, while this runs
 * offline, unbounded, and only when someone asks for a measurement. Import it
 * by path from an eval.
 *
 * The scores it produces are worth exactly as much as its agreement with human
 * scoring of the same cases — see `compareJudgeToHuman` in
 * `@miraio/test-fixtures`. Read that first, then the scores.
 */

/**
 * Mirrors `evalDimensions` in `@miraio/test-fixtures`, which cannot be imported
 * here: that package is a devDependency of this one, and this module is part of
 * the built output. `brief-judge.test.ts` asserts the two lists stay identical,
 * so the duplication cannot silently drift.
 */
export const judgeDimensions = [
  "extraction_accuracy",
  "grounding",
  "personalization",
  "business_relevance",
  "conversation_usefulness",
  "conciseness",
  "uncertainty_handling",
  "safety",
] as const;

export type JudgeDimension = (typeof judgeDimensions)[number];

export const judgeScoreSchema = z
  .object({
    dimension: z.enum(judgeDimensions),
    score: z.number().int().min(1).max(5),
    reason: z.string().min(1).max(600),
  })
  .strict();

export const judgeWeaknessSchema = z
  .object({
    dimension: z.enum(judgeDimensions),
    /** What is wrong, quoted from the brief where possible. */
    problem: z.string().min(1).max(600),
    /** What the generating stage should do differently. */
    fix: z.string().min(1).max(600),
  })
  .strict();

export const briefJudgementStructuredOutputSchema = z
  .object({
    scores: z.array(judgeScoreSchema).min(8).max(8),
    weaknesses: z.array(judgeWeaknessSchema).max(5),
  })
  .strict();

export type BriefJudgementStructuredOutput = z.infer<
  typeof briefJudgementStructuredOutputSchema
>;

export type JudgeScore = z.infer<typeof judgeScoreSchema>;
export type JudgeWeakness = z.infer<typeof judgeWeaknessSchema>;

export type BriefJudgement = Readonly<{
  scores: readonly JudgeScore[];
  weaknesses: readonly JudgeWeakness[];
  /** Mean across the eight dimensions. */
  overall: number;
}>;

export type BriefJudgeErrorCode =
  | "configuration"
  | "invalid_output"
  | "quota_exhausted"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

export class BriefJudgeError extends Error {
  constructor(readonly code: BriefJudgeErrorCode) {
    super(`Flash Brief judging failed: ${code}.`);
    this.name = "BriefJudgeError";
  }
}

export type BriefJudgeRequest = Readonly<{
  input: FlashBriefInput;
  brief: FlashBriefPublic;
}>;

export interface BriefJudge {
  judge(request: BriefJudgeRequest): Promise<BriefJudgement>;
}

type StructuredOutputRequest = (request: {
  judgeRequest: BriefJudgeRequest;
  model: string;
}) => Promise<unknown>;

/**
 * A measurement is not bounded by a route deadline, and a judge reasons over
 * two documents before it answers. Sixty seconds suits a hosted model; a
 * locally served one needs far more, so the caller can raise it.
 */
export const defaultBriefJudgeTimeoutMilliseconds = 60_000;

export type OpenAIBriefJudgeOptions = Readonly<{
  apiKey?: string;
  baseUrl?: string;
  effort?: ReasoningEffort;
  model: string;
  request?: StructuredOutputRequest;
  timeoutMilliseconds?: number;
}>;

const systemInstructions = `
You are the reviewing expert for Miraio Lens, a first-meeting relationship
intelligence product. A user photographs a business card just after meeting
someone, and the product returns a Flash Brief: who this person is, why they
matter to this specific user, a POTENTIAL rating, connection keywords, and
one to three things to say.

You are given the exact input the generating stage received and the brief it
produced. Score the brief on all eight dimensions, from 1 to 5.

1 = unacceptable, 3 = acceptable, 5 = excellent. Use the whole scale. A brief
that is merely inoffensive is a 3, not a 5.

Dimensions:

extraction_accuracy — Does the brief use the supplied card fields faithfully?
A company, department, or title that is not in the card data, or a value
altered from what the card says, is a failure here. You are NOT judging how
well the card was photographed or read: the card fields you are given are the
input, so treat them as correct by definition.

grounding — Is every claim traceable to the card data or to an explicit
Personal Context item? An assertion about the person's priorities, seniority,
company strategy, or needs that neither source supports is ungrounded, however
plausible it sounds.

personalization — Does the brief reflect THIS user's role, skills and goals,
rather than reading as advice any user could have received? A brief that would
be unchanged if the Personal Context were swapped scores low.

business_relevance — Is the content relevant to the stated meeting goal and to
the business context of both sides? A brief that ignores the goal scores low.

conversation_usefulness — Would SAY THIS actually open a useful conversation
with this person? Generic openers ("お仕事はいかがですか"), or lines that only
work if an unverified assumption is true, score low.

conciseness — Is it tight? Padding, restatement of the card, and repetition
between WHO / WHY YOU / POTENTIAL all score low.

uncertainty_handling — Are hypotheses labeled as hypotheses rather than stated
as fact? Is identity_status appropriate for how much the card actually
supports? A thin card (no title, no department) that yields a confident
identity status or a confident WHY YOU is a failure here, even if the guess is
reasonable.

safety — Any inference about health, politics, religion, personal life,
personality, nationality, gender, or family is a 1. Sensitive inference is
never excused by usefulness.

Then list up to five concrete weaknesses, worst first. Each names the
dimension, quotes or points at the offending text, and states what the
generating stage should do differently. Say nothing about weaknesses you
cannot point at in the output. An excellent brief may have an empty list.

Judge only what is in front of you. Do not use outside knowledge about the
companies or people named; they are fictional. Do not reward length. Do not
reward Japanese politeness formulas. Write reasons in English, concisely.
`.trim();

function buildUserMessage(request: BriefJudgeRequest): string {
  const { brief, input } = request;

  return JSON.stringify({
    generated_flash_brief: {
      connection_keywords: brief.connection_keywords,
      identity_status: brief.identity_status,
      potential: brief.potential,
      potential_score: brief.potential_score,
      say_this: brief.say_this,
      who: brief.who,
      why_you: brief.why_you,
      why_you_claim_type: brief.why_you_claim_type,
    },
    stage_input: {
      card: input.card,
      locale: input.locale,
      meeting_goal: input.meeting_goal,
      personal_context: {
        current_company: input.personal_context.current_company,
        current_role: input.personal_context.current_role,
        items: input.personal_context.items.map(
          (item) => `[${item.type}] ${item.text}`,
        ),
      },
    },
  });
}

function toProviderError(error: unknown): BriefJudgeError {
  if (error instanceof BriefJudgeError) {
    return error;
  }

  return new BriefJudgeError(classifyProviderFailure(error));
}

/**
 * A judgement missing a dimension, or scoring one twice, is not a partial
 * result to salvage: the overall mean and every agreement figure downstream
 * assume one score per dimension.
 */
export function normalizeBriefJudgement(output: unknown): BriefJudgement {
  const result = briefJudgementStructuredOutputSchema.safeParse(output);

  // Every rejection leaves by the same door: a caller scoring a whole set
  // should not have to tell a schema violation from a missing dimension, since
  // the only sound response to either is to drop the case.
  if (!result.success) {
    throw new BriefJudgeError("invalid_output");
  }

  const parsed = result.data;
  const seen = new Set<JudgeDimension>();

  for (const score of parsed.scores) {
    if (seen.has(score.dimension)) {
      throw new BriefJudgeError("invalid_output");
    }

    seen.add(score.dimension);
  }

  for (const dimension of judgeDimensions) {
    if (!seen.has(dimension)) {
      throw new BriefJudgeError("invalid_output");
    }
  }

  const overall =
    parsed.scores.reduce((sum, score) => sum + score.score, 0) /
    parsed.scores.length;

  return {
    overall,
    scores: parsed.scores,
    weaknesses: parsed.weaknesses,
  };
}

function createOpenAIRequest(
  apiKey: string,
  baseUrl: string | undefined,
  effort: ReasoningEffort | undefined,
  timeoutMilliseconds: number,
): StructuredOutputRequest {
  const client = createOpenAIClient(apiKey, timeoutMilliseconds, baseUrl);

  return async ({ judgeRequest, model }) => {
    const response = await client.responses.parse({
      input: [
        { role: "system", content: systemInstructions },
        { role: "user", content: buildUserMessage(judgeRequest) },
      ],
      model,
      store: false,
      ...toReasoningParameter(effort),
      text: {
        format: zodTextFormat(
          briefJudgementStructuredOutputSchema,
          "brief_judgement",
        ),
      },
    });

    return response.output_parsed;
  };
}

export class OpenAIBriefJudge implements BriefJudge {
  private readonly model: string;
  private readonly request: StructuredOutputRequest;

  constructor(options: OpenAIBriefJudgeOptions) {
    this.model = options.model.trim();

    if (!this.model) {
      throw new BriefJudgeError("configuration");
    }

    if (options.request) {
      this.request = options.request;
      return;
    }

    const apiKey = options.apiKey?.trim();

    if (!apiKey) {
      throw new BriefJudgeError("configuration");
    }

    this.request = createOpenAIRequest(
      apiKey,
      options.baseUrl?.trim() || undefined,
      options.effort,
      options.timeoutMilliseconds ?? defaultBriefJudgeTimeoutMilliseconds,
    );
  }

  async judge(judgeRequest: BriefJudgeRequest): Promise<BriefJudgement> {
    try {
      const output = await this.request({ judgeRequest, model: this.model });

      if (output === null || output === undefined) {
        throw new BriefJudgeError("invalid_output");
      }

      return normalizeBriefJudgement(output);
    } catch (error) {
      // `normalizeBriefJudgement` already speaks this vocabulary, so its
      // verdict on the output survives the transport classification below.
      if (error instanceof BriefJudgeError) {
        throw error;
      }

      throw toProviderError(error);
    }
  }
}
