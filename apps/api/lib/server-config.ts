import { isReasoningEffort, type ReasoningEffort } from "@miraio/ai";
import type { UserScopedSupabaseConfig } from "@miraio/db";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type OpenAIPersonalContextConfig = Readonly<{
  apiKey: string;
  baseUrl?: string;
  effort?: ReasoningEffort;
  model: string;
}>;

export type OpenAICardExtractionConfig = Readonly<{
  apiKey: string;
  baseUrl?: string;
  effort?: ReasoningEffort;
  model: string;
}>;

export type OpenAIFlashBriefConfig = Readonly<{
  apiKey: string;
  baseUrl?: string;
  effort?: ReasoningEffort;
  model: string;
}>;

export class ServerConfigurationError extends Error {
  constructor(readonly variable: string) {
    super(`Missing or invalid server configuration: ${variable}.`);
    this.name = "ServerConfigurationError";
  }
}

function requireValue(
  environment: ServerEnvironment,
  variable: string,
): string {
  const value = environment[variable]?.trim();

  if (!value) {
    throw new ServerConfigurationError(variable);
  }

  return value;
}

/**
 * Optional override that points every AI stage at an OpenAI-compatible server
 * instead of OpenAI — a locally served model, for instance. Absent, the stages
 * talk to OpenAI. An unparseable or non-HTTP value is a configuration defect
 * rather than a silent fallback to OpenAI: a deployment that meant to keep card
 * images on its own hardware must not start sending them to a third party
 * because a URL had a typo.
 */
function readProviderBaseUrl(
  environment: ServerEnvironment,
): string | undefined {
  const raw = environment["AI_PROVIDER_BASE_URL"]?.trim();

  if (!raw) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new ServerConfigurationError("AI_PROVIDER_BASE_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ServerConfigurationError("AI_PROVIDER_BASE_URL");
  }

  return url.toString().replace(/\/$/, "");
}

/**
 * Opt-in company web research. Off unless the value is exactly "on", because
 * it is the one stage that sends a query outside the configured provider and
 * bills per scan.
 *
 * Combining it with AI_PROVIDER_BASE_URL is a configuration defect rather than
 * a silent downgrade: a deployment that pointed the stages at its own server
 * to keep data in-house has not agreed to a hosted search tool, and a server
 * that lacks the tool would fail every scan as a provider outage instead.
 */
export function readCompanyWebSearchEnabled(
  environment: ServerEnvironment,
): boolean {
  const raw = environment["AI_COMPANY_WEB_SEARCH"]?.trim().toLowerCase();

  if (!raw || raw === "off") {
    return false;
  }

  if (raw !== "on") {
    throw new ServerConfigurationError("AI_COMPANY_WEB_SEARCH");
  }

  if (readProviderBaseUrl(environment)) {
    throw new ServerConfigurationError("AI_COMPANY_WEB_SEARCH");
  }

  return true;
}

/**
 * Per-stage reasoning depth. Absent leaves the parameter off the request, so a
 * non-reasoning model or a self-hosted server keeps working unchanged.
 *
 * An unrecognized value is a configuration defect rather than a silent
 * fallback: "minimal" and "standard" both look plausible and both make the
 * provider answer 400, which the stages would report as an outage and retry.
 */
export function readReasoningEffort(
  environment: ServerEnvironment,
  variable: string,
): ReasoningEffort | undefined {
  const raw = environment[variable]?.trim().toLowerCase();

  if (!raw) {
    return undefined;
  }

  if (!isReasoningEffort(raw)) {
    throw new ServerConfigurationError(variable);
  }

  return raw;
}

export function readServerSupabaseConfig(
  environment: ServerEnvironment,
): UserScopedSupabaseConfig {
  const rawUrl = requireValue(environment, "SUPABASE_URL");
  const publishableKey =
    environment.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    environment.SUPABASE_ANON_KEY?.trim();

  if (!publishableKey) {
    throw new ServerConfigurationError(
      "SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY",
    );
  }

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new ServerConfigurationError("SUPABASE_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ServerConfigurationError("SUPABASE_URL");
  }

  return {
    publishableKey,
    url: url.toString().replace(/\/$/, ""),
  };
}

export function readOpenAIPersonalContextConfig(
  environment: ServerEnvironment,
): OpenAIPersonalContextConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    baseUrl: readProviderBaseUrl(environment),
    effort: readReasoningEffort(environment, "AI_PERSONAL_CONTEXT_EFFORT"),
    model: requireValue(environment, "AI_PERSONAL_CONTEXT_MODEL"),
  };
}

export function readOpenAICardExtractionConfig(
  environment: ServerEnvironment,
): OpenAICardExtractionConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    baseUrl: readProviderBaseUrl(environment),
    effort: readReasoningEffort(environment, "AI_CARD_EXTRACTION_EFFORT"),
    model: requireValue(environment, "AI_CARD_EXTRACTION_MODEL"),
  };
}

export type OpenAICompanyContextConfig = Readonly<{
  apiKey: string;
  baseUrl?: string;
  effort?: ReasoningEffort;
  model: string;
  webSearch: boolean;
}>;

export type OpenAIEmbeddingConfig = Readonly<{
  apiKey: string;
  baseUrl?: string;
  model: string;
}>;

export type OpenAIMutualValueConfig = Readonly<{
  apiKey: string;
  baseUrl?: string;
  effort?: ReasoningEffort;
  model: string;
}>;

export function readOpenAICompanyContextConfig(
  environment: ServerEnvironment,
): OpenAICompanyContextConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    baseUrl: readProviderBaseUrl(environment),
    effort: readReasoningEffort(environment, "AI_COMPANY_CONTEXT_EFFORT"),
    model: requireValue(environment, "AI_COMPANY_CONTEXT_MODEL"),
    webSearch: readCompanyWebSearchEnabled(environment),
  };
}

/**
 * Semantic retrieval of Personal Context. Absent, the Flash Brief keeps
 * receiving every approved item, which is what it did before ML-023: a
 * deployment must be able to run without paying for embeddings.
 */
export function readOpenAIEmbeddingConfig(
  environment: ServerEnvironment,
): OpenAIEmbeddingConfig | null {
  const model = environment["AI_EMBEDDING_MODEL"]?.trim();

  if (!model) {
    return null;
  }

  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    baseUrl: readProviderBaseUrl(environment),
    model,
  };
}

export function readOpenAIFlashBriefConfig(
  environment: ServerEnvironment,
): OpenAIFlashBriefConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    baseUrl: readProviderBaseUrl(environment),
    effort: readReasoningEffort(environment, "AI_FLASH_BRIEF_EFFORT"),
    model: requireValue(environment, "AI_FLASH_BRIEF_MODEL"),
  };
}

export function readOpenAIMutualValueConfig(
  environment: ServerEnvironment,
): OpenAIMutualValueConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    baseUrl: readProviderBaseUrl(environment),
    effort: readReasoningEffort(environment, "AI_MUTUAL_VALUE_EFFORT"),
    model: requireValue(environment, "AI_MUTUAL_VALUE_MODEL"),
  };
}

export type CleanupConfig = Readonly<{
  serviceRoleKey: string;
  supabaseUrl: string;
}>;

export function readCleanupConfig(
  environment: ServerEnvironment,
): CleanupConfig {
  return {
    serviceRoleKey: requireValue(environment, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireValue(environment, "SUPABASE_URL"),
  };
}
