import type { UserScopedSupabaseConfig } from "@miraio/db";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type OpenAIPersonalContextConfig = Readonly<{
  apiKey: string;
  model: string;
}>;

export type OpenAICardExtractionConfig = Readonly<{
  apiKey: string;
  model: string;
}>;

export type OpenAIFlashBriefConfig = Readonly<{
  apiKey: string;
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
    model: requireValue(environment, "AI_PERSONAL_CONTEXT_MODEL"),
  };
}

export function readOpenAICardExtractionConfig(
  environment: ServerEnvironment,
): OpenAICardExtractionConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    model: requireValue(environment, "AI_CARD_EXTRACTION_MODEL"),
  };
}

export type OpenAICompanyContextConfig = Readonly<{
  apiKey: string;
  model: string;
}>;

export type OpenAIMutualValueConfig = Readonly<{
  apiKey: string;
  model: string;
}>;

export function readOpenAICompanyContextConfig(
  environment: ServerEnvironment,
): OpenAICompanyContextConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    model: requireValue(environment, "AI_COMPANY_CONTEXT_MODEL"),
  };
}

export function readOpenAIFlashBriefConfig(
  environment: ServerEnvironment,
): OpenAIFlashBriefConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    model: requireValue(environment, "AI_FLASH_BRIEF_MODEL"),
  };
}

export function readOpenAIMutualValueConfig(
  environment: ServerEnvironment,
): OpenAIMutualValueConfig {
  return {
    apiKey: requireValue(environment, "OPENAI_API_KEY"),
    model: requireValue(environment, "AI_MUTUAL_VALUE_MODEL"),
  };
}

export type CleanupConfig = Readonly<{
  serviceRoleKey: string;
  supabaseUrl: string;
}>;

export function readCleanupConfig(environment: ServerEnvironment): CleanupConfig {
  return {
    serviceRoleKey: requireValue(environment, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireValue(environment, "SUPABASE_URL"),
  };
}
