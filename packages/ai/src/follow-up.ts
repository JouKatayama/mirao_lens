import {
  followUpDraftSchema,
  followUpJudgementOutputSchema,
  normalizeFollowUpJudgement,
  type FollowUpDraft,
  type FollowUpDraftInput,
  type FollowUpInput,
  type FollowUpJudgement,
} from "@miraio/domain";
import { zodTextFormat } from "openai/helpers/zod";

import { classifyProviderFailure } from "./provider-error";
import {
  createOpenAIClient,
  providerTimeoutMilliseconds,
  toReasoningParameter,
  type ReasoningEffort,
} from "./provider-client";

/**
 * Pilot extension 5 (spec §2.4, ADR-0010). Two stages, never one prompt:
 * a judge chooses among declared decisions, and a drafter writes a message only
 * after a `follow_up` decision and only from inputs a message may contain.
 * Neither stage sends anything.
 */

export type FollowUpStageErrorCode =
  | "configuration"
  | "invalid_output"
  | "quota_exhausted"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

export class FollowUpStageError extends Error {
  constructor(readonly code: FollowUpStageErrorCode) {
    super(`Follow-up stage failed: ${code}.`);
    this.name = "FollowUpStageError";
  }
}

export interface FollowUpJudge {
  judge(input: FollowUpInput): Promise<FollowUpJudgement>;
}

export interface FollowUpDrafter {
  draft(input: FollowUpDraftInput): Promise<FollowUpDraft>;
}

type StructuredRequest<TInput> = (request: {
  input: TInput;
  model: string;
}) => Promise<unknown>;

export type OpenAIFollowUpOptions<TInput> = Readonly<{
  apiKey?: string;
  baseUrl?: string;
  effort?: ReasoningEffort;
  model: string;
  request?: StructuredRequest<TInput>;
}>;

const judgeInstructions = `
You are the Follow-up Judgement stage for Miraio Lens.

The user exchanged business cards with the person described in the input.
Decide whether the user should get back in touch with this person.

Choose exactly one decision:
- follow_up: there is a concrete, grounded reason to contact them now.
- hold: there may be value, but not enough grounds yet, or timing is unclear.
- no_follow_up: the inputs give a grounded reason that contacting them is not
  worthwhile now.

Give one to three reasons. Each reason must:
- name its source: card, meeting_goal, note, mutual_value, next_action,
  encounter_history, or connection;
- be labelled "fact" only if it restates something in the user's note, the
  card, the meeting goal, a recorded next action, the encounter count, or a
  recorded connection;
- be labelled "hypothesis" if it is an inference, and always when it draws on
  mutual_value (which is itself AI output).

confidence is your probability, between 0 and 1, that the decision is right.
If the note is empty and nothing else is specific, prefer hold with low
confidence and say what is missing in uncertainty.

timing: a short suggestion such as "3日以内" when the decision is follow_up,
otherwise null.

Strict rules:
- Respond in the user's locale (Japanese if locale is "ja").
- Never invent facts about the person, their company, budget, or intent.
- Never include sensitive inferences (personality, politics, health, etc.).
- Do not add commentary outside the schema.
`.trim();

const draftInstructions = `
You are the Follow-up Draft stage for Miraio Lens.

Write a short follow-up message from the user to the person on the card. The
user will review, edit, and send it themselves.

Use only these inputs: the card fields, the user's own note, the user's
approved personal context, the meeting goal, and the fact reasons provided.
Do not state anything else as fact. Do not guess the person's needs, budget,
or intentions. If the note is empty, keep the message to thanks and a light,
concrete next step.

Output:
- subject: one line.
- body: a polite business message in the user's locale (Japanese keigo if
  locale is "ja"), at most about 8 short lines, ending with the user's
  signature placeholder "{署名}". Address the person by the card name; do not
  translate names or company names.

Do not add commentary outside the schema.
`.trim();

function toStageError(error: unknown): FollowUpStageError {
  if (error instanceof FollowUpStageError) {
    return error;
  }

  if (error instanceof Error && error.name === "ZodError") {
    return new FollowUpStageError("invalid_output");
  }

  return new FollowUpStageError(classifyProviderFailure(error));
}

function createRequest<TInput>(
  options: OpenAIFollowUpOptions<TInput>,
  instructions: string,
  format: ReturnType<typeof zodTextFormat>,
): StructuredRequest<TInput> {
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    throw new FollowUpStageError("configuration");
  }

  const client = createOpenAIClient(
    apiKey,
    providerTimeoutMilliseconds.followUp,
    options.baseUrl?.trim() || undefined,
  );

  return async ({ input, model }) => {
    const response = await client.responses.parse({
      input: [
        { role: "system", content: instructions },
        { role: "user", content: JSON.stringify(input) },
      ],
      model,
      store: false,
      ...toReasoningParameter(options.effort),
      text: { format },
    });

    return response.output_parsed;
  };
}

function resolve<TInput>(
  options: OpenAIFollowUpOptions<TInput>,
  instructions: string,
  format: ReturnType<typeof zodTextFormat>,
): { model: string; request: StructuredRequest<TInput> } {
  const model = options.model.trim();

  if (!model) {
    throw new FollowUpStageError("configuration");
  }

  return {
    model,
    request: options.request ?? createRequest(options, instructions, format),
  };
}

export class OpenAIFollowUpJudge implements FollowUpJudge {
  private readonly model: string;
  private readonly request: StructuredRequest<FollowUpInput>;

  constructor(options: OpenAIFollowUpOptions<FollowUpInput>) {
    const resolved = resolve(
      options,
      judgeInstructions,
      zodTextFormat(followUpJudgementOutputSchema, "follow_up_judgement"),
    );
    this.model = resolved.model;
    this.request = resolved.request;
  }

  async judge(input: FollowUpInput): Promise<FollowUpJudgement> {
    try {
      const output = await this.request({ input, model: this.model });

      if (output === null || output === undefined) {
        throw new FollowUpStageError("invalid_output");
      }

      return normalizeFollowUpJudgement(output);
    } catch (error) {
      throw toStageError(error);
    }
  }
}

export class OpenAIFollowUpDrafter implements FollowUpDrafter {
  private readonly model: string;
  private readonly request: StructuredRequest<FollowUpDraftInput>;

  constructor(options: OpenAIFollowUpOptions<FollowUpDraftInput>) {
    const resolved = resolve(
      options,
      draftInstructions,
      zodTextFormat(followUpDraftSchema, "follow_up_draft"),
    );
    this.model = resolved.model;
    this.request = resolved.request;
  }

  async draft(input: FollowUpDraftInput): Promise<FollowUpDraft> {
    try {
      const output = await this.request({ input, model: this.model });

      if (output === null || output === undefined) {
        throw new FollowUpStageError("invalid_output");
      }

      return followUpDraftSchema.parse(output);
    } catch (error) {
      throw toStageError(error);
    }
  }
}
