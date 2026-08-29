import {
  mutualValueStructuredOutputSchema,
  MutualValueValidationError,
  normalizeMutualValue,
  type MutualValue,
  type MutualValueInput,
} from "@miraio/domain";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

export type MutualValueGeneratorErrorCode =
  | "configuration"
  | "invalid_output"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

export class MutualValueGeneratorError extends Error {
  constructor(readonly code: MutualValueGeneratorErrorCode) {
    super(`Mutual Value generation failed: ${code}.`);
    this.name = "MutualValueGeneratorError";
  }
}

export interface MutualValueGenerator {
  generate(input: MutualValueInput): Promise<MutualValue>;
}

type StructuredOutputRequest = (request: {
  input: MutualValueInput;
  model: string;
}) => Promise<unknown>;

export type OpenAIMutualValueGeneratorOptions = Readonly<{
  apiKey?: string;
  model: string;
  request?: StructuredOutputRequest;
}>;

const systemInstructions = `
You are the Mutual Value stage for Miraio Lens.

Generate a Mutual Value analysis for the user's meeting with the person on the
business card. You have access to the Flash Brief already generated for this
meeting.

When a company_context object is provided, use it to enrich GIVE (how the
user's expertise fits the company's industry/scale), GET (what the user can
learn from the company/role context), and BRIDGE (complementarity grounded in
company scale and the user's role). Do not reproduce the raw context verbatim.
If company_context is null, rely only on card data and Flash Brief.

Output exactly five fields in the supplied locale:

GIVE — One to five specific things the user can offer this person, grounded in
the user's Personal Context (skills, knowledge, network, resources). Distinguish
facts from hypotheses.

GET — One to five specific things the user could learn or receive from this
person. Ground it in the card data and meeting goal. Distinguish facts from
hypotheses.

BRIDGE — One or two sentences explaining why these two people have strong
reasons to talk: the complementarity, shared challenge, or mutual opportunity
that makes this meeting valuable beyond surface-level similarity.

ASK — One to three concrete questions the user should ask now to validate
hypotheses or deepen the connection. Each question should be tied to a specific
hypothesis it validates, or null if it is for exploration.

NEXT — A single, specific next action the user can take to advance this
relationship. Include an optional timing suggestion and a clear reason.

Strict rules:
- Respond in the user's locale (Japanese if locale is "ja").
- Do not translate names or company names.
- Never invent roles, skills, achievements, or relationships.
- Distinguish facts (grounded in card data or explicit user context) from
  hypotheses (inferred or assumed). Use claim_type accordingly.
- Never include sensitive inferences (personality, politics, health, etc.).
- Do not manufacture complementarity where none plausibly exists.
- Keep each item concise and actionable.
- Do not add commentary outside the schema.
- evidence_ids: always output an empty array [] — the system links UUIDs after
  generation.
`.trim();

function meetingGoalLabel(goal: MutualValueInput["meeting_goal"]): string {
  const labels: Record<MutualValueInput["meeting_goal"], string> = {
    learning_information_exchange: "情報交換 / learning & information exchange",
    networking: "ネットワーキング / networking",
    other: "その他 / other",
    partnership: "パートナーシップ / partnership",
    recruiting: "採用 / recruiting",
    sales: "営業 / sales",
  };

  return labels[goal];
}

function buildUserMessage(input: MutualValueInput): string {
  const contextLines = input.personal_context.items
    .map((item) => `  [${item.type}] ${item.text}`)
    .join("\n");

  return JSON.stringify({
    card: {
      company: input.card.company,
      department: input.card.department,
      email: input.card.email ?? null,
      language: input.card.language,
      name: input.card.name,
      phone: input.card.phone ?? null,
      title: input.card.title,
      website: input.card.website ?? null,
    },
    company_context: input.company_context ?? null,
    flash_brief: input.flash_brief,
    locale: input.locale,
    meeting_goal: meetingGoalLabel(input.meeting_goal),
    personal_context: {
      current_company: input.personal_context.current_company,
      current_role: input.personal_context.current_role,
      items: contextLines || "(none)",
    },
  });
}

function toProviderError(error: unknown): MutualValueGeneratorError {
  if (error instanceof MutualValueGeneratorError) {
    return error;
  }

  const candidate = error as { name?: unknown; status?: unknown };

  if (candidate.status === 429) {
    return new MutualValueGeneratorError("rate_limited");
  }

  if (candidate.name === "AbortError" || candidate.status === 408) {
    return new MutualValueGeneratorError("timeout");
  }

  return new MutualValueGeneratorError("provider_unavailable");
}

function createOpenAIRequest(apiKey: string): StructuredOutputRequest {
  const client = new OpenAI({ apiKey });

  return async ({ input, model }) => {
    const response = await client.responses.parse({
      input: [
        { role: "system", content: systemInstructions },
        { role: "user", content: buildUserMessage(input) },
      ],
      model,
      store: false,
      text: {
        format: zodTextFormat(
          mutualValueStructuredOutputSchema,
          "mutual_value",
        ),
      },
    });

    return response.output_parsed;
  };
}

export class OpenAIMutualValueGenerator implements MutualValueGenerator {
  private readonly model: string;
  private readonly request: StructuredOutputRequest;

  constructor(options: OpenAIMutualValueGeneratorOptions) {
    this.model = options.model.trim();

    if (!this.model) {
      throw new MutualValueGeneratorError("configuration");
    }

    if (options.request) {
      this.request = options.request;
      return;
    }

    const apiKey = options.apiKey?.trim();

    if (!apiKey) {
      throw new MutualValueGeneratorError("configuration");
    }

    this.request = createOpenAIRequest(apiKey);
  }

  async generate(input: MutualValueInput): Promise<MutualValue> {
    try {
      const output = await this.request({ input, model: this.model });

      if (output === null || output === undefined) {
        throw new MutualValueGeneratorError("invalid_output");
      }

      return normalizeMutualValue(output);
    } catch (error) {
      if (
        error instanceof MutualValueGeneratorError &&
        error.code === "invalid_output"
      ) {
        throw error;
      }

      if (
        error instanceof MutualValueValidationError ||
        (error instanceof Error && error.name === "ZodError")
      ) {
        throw new MutualValueGeneratorError("invalid_output");
      }

      throw toProviderError(error);
    }
  }
}
