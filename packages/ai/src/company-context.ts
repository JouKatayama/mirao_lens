import {
  companyContextStructuredOutputSchema,
  type CompanyContext,
  type CompanyContextInput,
} from "@miraio/domain";
import { zodTextFormat } from "openai/helpers/zod";

import { classifyProviderFailure } from "./provider-error";
import {
  createOpenAIClient,
  providerTimeoutMilliseconds,
  toReasoningParameter,
  type ReasoningEffort,
} from "./provider-client";

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

export const companyWebSearchInstructions = `
Web research is enabled for this request.

Search for the COMPANY only. You are given the company name, department and
title, and deliberately not the person's name: a page about a same-named
individual is the wrong-person failure this product must never present as
fact, and you cannot verify identity from a business card.

- Prefer the company's own site (about, company profile, IR, newsroom).
- Read at most four pages and cite exactly the ones you used in SOURCES, with
  the page title and its full https URL. Never cite a page you did not read.
- Ground COMPANY_DESCRIPTION, INDUSTRY, COMPANY_SCALE and ROLE_SCOPE in what
  those pages actually say.
- If search returns nothing usable, output an empty SOURCES array and leave the
  fields null. An honest null beats a guess dressed as a citation.
- Public pages only. Never attempt a login, a paywall, or a closed network.
`.trim();

// Extracted so a test can assert the request the provider receives, which is
// otherwise only visible inside a live call.
export function buildCompanyContextRequestBody(request: {
  effort?: ReasoningEffort;
  input: CompanyContextInput;
  model: string;
  webSearch: boolean;
}) {
  return {
    input: [
      {
        role: "system" as const,
        content: request.webSearch
          ? `${systemInstructions}

${companyWebSearchInstructions}`
          : systemInstructions,
      },
      { role: "user" as const, content: buildUserMessage(request.input) },
    ],
    model: request.model,
    store: false,
    text: {
      format: zodTextFormat(
        companyContextStructuredOutputSchema,
        "company_context",
      ),
    },
    ...toReasoningParameter(request.effort),
    ...(request.webSearch ? { tools: [{ type: "web_search" as const }] } : {}),
  };
}

export type OpenAICompanyContextGeneratorOptions = Readonly<{
  apiKey?: string;
  baseUrl?: string;
  model: string;
  effort?: ReasoningEffort;
  request?: StructuredOutputRequest;
  /**
   * Lets the stage read public web pages about the company through the
   * provider's own search tool. Off by default: it costs money per scan, and
   * it is the only place in the pipeline that reaches outside the provider.
   */
  webSearch?: boolean;
}>;

const systemInstructions = `
You are the Fast Context stage for Miraio Lens.

Given a business card's company name, title, and department, generate structured
context about the organization and role to help the Flash Brief stage produce
richer and more grounded analysis.

Output every field below in the supplied locale:

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

SOURCES — The pages you read, as title and full URL. Unless web research is
explicitly enabled below, you have read nothing: output an empty array. Never
cite a page from memory; a remembered URL is a fabricated citation.

Strict rules:
- Respond in the user's locale (Japanese if locale is "ja").
- Base inferences ONLY on the provided company name, title, and department,
  plus any pages you actually read when web research is enabled.
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

function createOpenAIRequest(
  apiKey: string,
  baseUrl: string | undefined,
  webSearch: boolean,
  effort: ReasoningEffort | undefined,
): StructuredOutputRequest {
  const client = createOpenAIClient(
    apiKey,
    // Reading pages takes longer than answering from priors, and this stage is
    // non-blocking for the brief, so researching gets its own budget.
    webSearch
      ? providerTimeoutMilliseconds.companyWebResearch
      : providerTimeoutMilliseconds.companyContext,
    baseUrl,
  );

  return async ({ input, model }) => {
    const response = await client.responses.parse(
      buildCompanyContextRequestBody({ effort, input, model, webSearch }),
    );

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

    this.request = createOpenAIRequest(
      apiKey,
      options.baseUrl?.trim() || undefined,
      options.webSearch === true,
      options.effort,
    );
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
