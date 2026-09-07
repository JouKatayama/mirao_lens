import {
  companyContextStructuredOutputSchema,
  type CompanyContext,
  type CompanyContextInput,
} from "@miraio/domain";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { classifyProviderFailure } from "./provider-error";

export type CompanyContextGeneratorErrorCode =
  | "configuration"
  | "invalid_output"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable";

export class CompanyContextGeneratorError extends Error {
  constructor(readonly code: CompanyContextGeneratorErrorCode) {
    super(`Company Context generation failed: ${code}.`);
    this.name = "CompanyContextGeneratorError";
  }
}

export interface CompanyContextGenerator {
  generate(input: CompanyContextInput): Promise<CompanyContext>;
}

type StructuredOutputRequest = (request: {
  input: CompanyContextInput;
  model: string;
}) => Promise<unknown>;

export type OpenAICompanyContextGeneratorOptions = Readonly<{
  apiKey?: string;
  model: string;
  request?: StructuredOutputRequest;
}>;

const systemInstructions = `
You are the Fast Context stage for Miraio Lens.

Given a business card's company name, title, and department, generate structured
context about the organization and role to help the Flash Brief stage produce
richer and more grounded analysis.

Output exactly five fields in the supplied locale:

COMPANY_DESCRIPTION — One sentence describing what this company does, based only
on the company name. If the company is unknown or the name provides no signal,
output null.

INDUSTRY — The primary industry or sector. Use concise bilingual labels such as
"IT・ソフトウェア / IT & Software", "金融 / Financial Services",
"製造 / Manufacturing", "コンサルティング / Consulting". Output null if the
company name gives no signal.

COMPANY_SCALE — Categorize the likely scale:
- "startup": likely an early-stage or growth-stage venture
- "sme": small to medium enterprise (likely under 500 employees)
- "enterprise": large corporation (likely 500+ employees or a well-known brand)
- "unknown": cannot be determined from the name alone

ROLE_SCOPE — One sentence describing what this role typically involves at this
type of company. Base on the title and department. Output null if title is absent.

ROLE_LEVEL — Categorize the seniority level:
- "individual_contributor": specialist, engineer, analyst, associate, staff
- "manager": manager, lead, section chief, 係長, 課長
- "director": director, VP, general manager, 部長, 本部長
- "executive": C-suite, president, CEO, CTO, 役員, 取締役
- "unknown": cannot be determined from the available data

Strict rules:
- Respond in the user's locale (Japanese if locale is "ja").
- Base inferences ONLY on the provided company name, title, and department.
- Do not invent revenue figures, headcount, specific products, or named clients.
- Never include sensitive inferences (politics, health, personality, etc.).
- Do not add commentary outside the schema.
`.trim();

function buildUserMessage(input: CompanyContextInput): string {
  return JSON.stringify({
    company: input.company,
    department: input.department,
    locale: input.locale,
    title: input.title,
  });
}

function toProviderError(error: unknown): CompanyContextGeneratorError {
  if (error instanceof CompanyContextGeneratorError) {
    return error;
  }

  return new CompanyContextGeneratorError(classifyProviderFailure(error));
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
          companyContextStructuredOutputSchema,
          "company_context",
        ),
      },
    });

    return response.output_parsed;
  };
}

export class OpenAICompanyContextGenerator implements CompanyContextGenerator {
  private readonly model: string;
  private readonly request: StructuredOutputRequest;

  constructor(options: OpenAICompanyContextGeneratorOptions) {
    this.model = options.model.trim();

    if (!this.model) {
      throw new CompanyContextGeneratorError("configuration");
    }

    if (options.request) {
      this.request = options.request;
      return;
    }

    const apiKey = options.apiKey?.trim();

    if (!apiKey) {
      throw new CompanyContextGeneratorError("configuration");
    }

    this.request = createOpenAIRequest(apiKey);
  }

  async generate(input: CompanyContextInput): Promise<CompanyContext> {
    try {
      const output = await this.request({ input, model: this.model });

      if (output === null || output === undefined) {
        throw new CompanyContextGeneratorError("invalid_output");
      }

      const parsed = companyContextStructuredOutputSchema.safeParse(output);

      if (!parsed.success) {
        throw new CompanyContextGeneratorError("invalid_output");
      }

      return parsed.data;
    } catch (error) {
      if (
        error instanceof CompanyContextGeneratorError &&
        error.code === "invalid_output"
      ) {
        throw error;
      }

      throw toProviderError(error);
    }
  }
}
