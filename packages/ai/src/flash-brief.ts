import {
  flashBriefStructuredOutputSchema,
  FlashBriefValidationError,
  normalizeFlashBrief,
  type FlashBrief,
  type FlashBriefInput,
} from "@miraio/domain";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { classifyProviderFailure } from "./provider-error";

export type FlashBriefGeneratorErrorCode =
  | "configuration"
  | "invalid_output"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

export class FlashBriefGeneratorError extends Error {
  constructor(readonly code: FlashBriefGeneratorErrorCode) {
    super(`Flash Brief generation failed: ${code}.`);
    this.name = "FlashBriefGeneratorError";
  }
}

export interface FlashBriefGenerator {
  generate(input: FlashBriefInput): Promise<FlashBrief>;
}

type StructuredOutputRequest = (request: {
  input: FlashBriefInput;
  model: string;
}) => Promise<unknown>;

export type OpenAIFlashBriefGeneratorOptions = Readonly<{
  apiKey?: string;
  model: string;
  request?: StructuredOutputRequest;
}>;

const systemInstructions = `
You are the Relationship Fast Path stage for Miraio Lens.

Generate a Flash Brief for the user's upcoming or recent meeting with the person
on the business card.

When a company_context object is provided, use it to enrich WHO (company
description), WHY YOU (relevance to the user), SAY THIS (targeted openers), and
POTENTIAL (relationship value). Do not reproduce the raw context verbatim; use
it to ground and sharpen each section. If company_context is null, rely only on
the card data.

Output exactly five fields in the supplied locale:

WHO — One or two sentences describing who this person is, based only on their
business card data (name, company, department, title). Never infer seniority,
gender, personality, or public-web facts.

WHY YOU — One or two sentences explaining why this specific connection is
relevant to the user, grounded in explicit overlaps between the card data and
the user's personal context items. Do not invent overlaps; if none exist, write
that a new perspective may be valuable.

SAY THIS — Two or three concrete, specific conversation starters tailored to
the meeting goal and the person's context. Avoid generic openers.

POTENTIAL — One or two sentences describing the relationship potential:
what the user can give, receive, or bridge with this person. Ground it in the
user's actual offers and seeks.

IDENTITY_STATUS — Assess how confidently the card data identifies this
specific individual. Choose exactly one value:
- "high_confidence": full name + company present AND email domain matches
  company domain, OR the name is demonstrably uncommon combined with a unique
  title/department.
- "medium_confidence": full name + company are present but email is absent or
  the domain does not match the company.
- "unresolved": name is null/blank, or only a single name with no company, or
  the data is too sparse to form a working hypothesis.
- "verified": do not use — this requires external confirmation not available
  from card data alone.

If prior_identity_status is provided (not null), treat it as a confidence
floor: you may output the same level or upgrade it (e.g., unresolved →
medium_confidence), but never downgrade it. The "verified" value may only be
output when prior_identity_status is already "verified".

Always choose the most conservative level the card data supports, subject to
the floor above.

Strict rules:
- Respond in the user's locale (Japanese if locale is "ja").
- Do not translate names or company names.
- Never invent roles, skills, achievements, or relationships.
- Never include sensitive inferences (personality, politics, health, etc.).
- Keep each field concise and actionable.
- Do not add commentary outside the schema.
`.trim();

function meetingGoalLabel(goal: FlashBriefInput["meeting_goal"]): string {
  const labels: Record<FlashBriefInput["meeting_goal"], string> = {
    learning_information_exchange: "情報交換 / learning & information exchange",
    networking: "ネットワーキング / networking",
    other: "その他 / other",
    partnership: "パートナーシップ / partnership",
    recruiting: "採用 / recruiting",
    sales: "営業 / sales",
  };

  return labels[goal];
}

function buildUserMessage(input: FlashBriefInput): string {
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
    locale: input.locale,
    meeting_goal: meetingGoalLabel(input.meeting_goal),
    personal_context: {
      current_company: input.personal_context.current_company,
      current_role: input.personal_context.current_role,
      items: contextLines || "(none)",
    },
    prior_identity_status: input.prior_identity_status ?? null,
  });
}

function toProviderError(error: unknown): FlashBriefGeneratorError {
  if (error instanceof FlashBriefGeneratorError) {
    return error;
  }

  return new FlashBriefGeneratorError(classifyProviderFailure(error));
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
          flashBriefStructuredOutputSchema,
          "flash_brief",
        ),
      },
    });

    return response.output_parsed;
  };
}

export class OpenAIFlashBriefGenerator implements FlashBriefGenerator {
  private readonly model: string;
  private readonly request: StructuredOutputRequest;

  constructor(options: OpenAIFlashBriefGeneratorOptions) {
    this.model = options.model.trim();

    if (!this.model) {
      throw new FlashBriefGeneratorError("configuration");
    }

    if (options.request) {
      this.request = options.request;
      return;
    }

    const apiKey = options.apiKey?.trim();

    if (!apiKey) {
      throw new FlashBriefGeneratorError("configuration");
    }

    this.request = createOpenAIRequest(apiKey);
  }

  async generate(input: FlashBriefInput): Promise<FlashBrief> {
    try {
      const output = await this.request({ input, model: this.model });

      if (output === null || output === undefined) {
        throw new FlashBriefGeneratorError("invalid_output");
      }

      return normalizeFlashBrief(output);
    } catch (error) {
      if (
        error instanceof FlashBriefGeneratorError &&
        error.code === "invalid_output"
      ) {
        throw error;
      }

      if (
        error instanceof FlashBriefValidationError ||
        (error instanceof Error && error.name === "ZodError")
      ) {
        throw new FlashBriefGeneratorError("invalid_output");
      }

      throw toProviderError(error);
    }
  }
}
