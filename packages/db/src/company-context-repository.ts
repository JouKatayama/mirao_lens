import {
  type CompanyContext,
  type CompanyContextInput,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

export type CompanyContextRepositoryErrorCode =
  "database_error" | "not_found";

export class CompanyContextRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: CompanyContextRepositoryErrorCode = "database_error",
  ) {
    super(`Company Context persistence failed: ${operation}.`);
    this.name = "CompanyContextRepositoryError";
  }
}

export type CompanyContextClaim = Readonly<{
  runId: string;
}>;

export type AuthenticatedCompanyContextSession = Readonly<{
  repository: CompanyContextRepository;
  userId: string;
}>;

export async function authenticateCompanyContextSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedCompanyContextSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new CompanyContextRepository(client),
    userId: data.user.id,
  };
}

export class CompanyContextRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async claimContext(
    scanId: string,
    provider: string,
    modelAlias: string,
  ): Promise<CompanyContextClaim | null> {
    const { data, error } = await this.client.rpc("claim_company_context", {
      p_model_alias: modelAlias,
      p_provider: provider,
      p_scan_id: scanId,
    });

    if (error) {
      throw new CompanyContextRepositoryError("claim_context");
    }

    const claim = data[0];

    return claim ? { runId: claim.run_id } : null;
  }

  async completeContext(
    scanId: string,
    runId: string,
    context: CompanyContext,
    latencyMs: number,
  ): Promise<void> {
    const { data, error } = await this.client.rpc("persist_company_context", {
      p_context_json: context as unknown as Json,
      p_latency_ms: latencyMs,
      p_run_id: runId,
      p_scan_id: scanId,
    });

    if (error) {
      throw new CompanyContextRepositoryError("complete_context");
    }

    if (!data) {
      throw new CompanyContextRepositoryError("complete_context", "not_found");
    }
  }

  async failContext(
    scanId: string,
    runId: string,
    errorCode: string,
  ): Promise<void> {
    const { data, error } = await this.client.rpc("fail_company_context", {
      p_error_code: errorCode,
      p_run_id: runId,
      p_scan_id: scanId,
    });

    if (error || !data) {
      throw new CompanyContextRepositoryError("fail_context");
    }
  }

  async getContextInput(scanId: string): Promise<CompanyContextInput | null> {
    const { data, error } = await this.client
      .from("business_cards")
      .select("company,title,department,language")
      .eq("scan_id", scanId)
      .maybeSingle();

    if (error) {
      throw new CompanyContextRepositoryError("get_context_input");
    }

    if (!data) {
      return null;
    }

    return {
      company: data.company,
      department: data.department,
      locale: data.language ?? "ja",
      title: data.title,
    };
  }
}
