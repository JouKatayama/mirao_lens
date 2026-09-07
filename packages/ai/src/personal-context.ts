import {
  normalizePersonalContextStructuredOutput,
  PersonalContextValidationError,
  personalContextStructuredOutputSchema,
  type PersonalContextOnboardingInput,
  type PersonalContextStructuredOutput,
} from "@miraio/domain";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { classifyProviderFailure } from "./provider-error";

export type PersonalContextStructuringErrorCode =
  | "configuration"
  | "invalid_output"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

export class PersonalContextStructuringError extends Error {
  constructor(readonly code: PersonalContextStructuringErrorCode) {
    super(`Personal Context structuring failed: ${code}.`);
    this.name = "PersonalContextStructuringError";
  }
}

export interface PersonalContextStructurer {
  structure(
    input: PersonalContextOnboardingInput,
  ): Promise<PersonalContextStructuredOutput>;
}

type StructuredOutputRequest = (request: {
  input: PersonalContextOnboardingInput;
  model: string;
}) => Promise<unknown>;

export type OpenAIPersonalContextStructurerOptions = Readonly<{
  apiKey?: string;
  model: string;
  request?: StructuredOutputRequest;
}>;

const systemInstructions = `
You structure private professional context for Miraio Lens.

Return concise, atomic suggestions using only the supplied schema and the
user's language. Preserve the user's meaning. Keep past experience, expertise,
strong skills, current themes, offers, seeking goals, and free text distinct.
Always include at least one offer suggestion based only on answers.offer.

Never invent employers, roles, achievements, skills, preferences, goals, or
relationships. Never infer sensitive traits or personality. Tags are optional
short retrieval labels, not new facts. Remove duplicates. Do not approve items.
`.trim();

function toProviderError(error: unknown): PersonalContextStructuringError {
  if (error instanceof PersonalContextStructuringError) {
    return error;
  }

  return new PersonalContextStructuringError(classifyProviderFailure(error));
}

function createOpenAIRequest(apiKey: string): StructuredOutputRequest {
  const client = new OpenAI({ apiKey });

  return async ({ input, model }) => {
    const response = await client.responses.parse({
      model,
      input: [
        { role: "system", content: systemInstructions },
        {
          role: "user",
          content: JSON.stringify({
            profile: input.profile,
            answers: input.answers,
            locale: input.locale,
          }),
        },
      ],
      store: false,
      text: {
        format: zodTextFormat(
          personalContextStructuredOutputSchema,
          "personal_context_suggestions",
        ),
      },
    });

    return response.output_parsed;
  };
}

export class OpenAIPersonalContextStructurer implements PersonalContextStructurer {
  private readonly model: string;
  private readonly request: StructuredOutputRequest;

  constructor(options: OpenAIPersonalContextStructurerOptions) {
    this.model = options.model.trim();

    if (!this.model) {
      throw new PersonalContextStructuringError("configuration");
    }

    if (options.request) {
      this.request = options.request;
      return;
    }

    const apiKey = options.apiKey?.trim();

    if (!apiKey) {
      throw new PersonalContextStructuringError("configuration");
    }

    this.request = createOpenAIRequest(apiKey);
  }

  async structure(
    input: PersonalContextOnboardingInput,
  ): Promise<PersonalContextStructuredOutput> {
    try {
      const output = await this.request({ input, model: this.model });

      if (output === null || output === undefined) {
        throw new PersonalContextStructuringError("invalid_output");
      }

      const normalized = normalizePersonalContextStructuredOutput(output);

      if (!normalized.suggestions.some((item) => item.type === "offer")) {
        throw new PersonalContextStructuringError("invalid_output");
      }

      return normalized;
    } catch (error) {
      if (
        error instanceof PersonalContextStructuringError &&
        error.code === "invalid_output"
      ) {
        throw error;
      }

      if (
        error instanceof PersonalContextValidationError ||
        (error instanceof Error && error.name === "ZodError")
      ) {
        throw new PersonalContextStructuringError("invalid_output");
      }

      throw toProviderError(error);
    }
  }
}
