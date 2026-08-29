import {
  personalContextItemSchema,
  type PersonalContextItem,
  type PersonalContextItemUpdate,
  type PersonalContextOnboardingInput,
  type PersonalContextResponse,
  type PersonalContextStructuredOutput,
} from "@miraio/domain";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./database.types";

const contextItemColumns =
  "id,type,text,tags,source_type,user_approved,created_at,updated_at" as const;

export type UserScopedSupabaseConfig = Readonly<{
  publishableKey: string;
  url: string;
}>;

export type AuthenticatedDatabaseSession = Readonly<{
  repository: PersonalContextRepository;
  userId: string;
}>;

export class PersonalContextRepositoryError extends Error {
  readonly code: string;
  readonly operation: string;

  constructor(operation: string, code = "database_error") {
    super(`Personal Context database operation failed: ${operation}.`);
    this.name = "PersonalContextRepositoryError";
    this.code = code;
    this.operation = operation;
  }
}

function mapItem(row: {
  created_at: string;
  id: string;
  source_type: string;
  tags: string[];
  text: string;
  type: string;
  updated_at: string;
  user_approved: boolean;
}): PersonalContextItem {
  return personalContextItemSchema.parse(row);
}

export function createUserScopedSupabaseClient(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export async function authenticateDatabaseSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedDatabaseSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new PersonalContextRepository(client),
    userId: data.user.id,
  };
}

export class PersonalContextRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getApproved(): Promise<PersonalContextResponse> {
    const [profileResult, itemsResult] = await Promise.all([
      this.client
        .from("profiles")
        .select("current_company,current_role")
        .maybeSingle(),
      this.client
        .from("personal_context_items")
        .select(contextItemColumns)
        .eq("user_approved", true)
        .order("type", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (profileResult.error) {
      throw new PersonalContextRepositoryError(
        "read_profile",
        profileResult.error.code,
      );
    }

    if (itemsResult.error) {
      throw new PersonalContextRepositoryError(
        "read_approved_items",
        itemsResult.error.code,
      );
    }

    return {
      profile: {
        current_company: profileResult.data?.current_company ?? null,
        current_role: profileResult.data?.current_role ?? null,
      },
      items: (itemsResult.data ?? []).map(mapItem),
    };
  }

  async persistOnboarding(
    input: PersonalContextOnboardingInput,
    structuredOutput: PersonalContextStructuredOutput,
  ): Promise<PersonalContextItem[]> {
    const { data, error } = await this.client.rpc(
      "persist_personal_context_onboarding",
      {
        p_current_company: input.profile.current_company ?? "",
        p_current_role: input.profile.current_role,
        p_request_id: input.request_id,
        p_suggestions: structuredOutput.suggestions as Json,
      },
    );

    if (error) {
      throw new PersonalContextRepositoryError(
        "persist_onboarding",
        error.code,
      );
    }

    return data.map(mapItem);
  }

  async updateItem(
    itemId: string,
    update: PersonalContextItemUpdate,
  ): Promise<PersonalContextItem | null> {
    const { data, error } = await this.client
      .from("personal_context_items")
      .update(update)
      .eq("id", itemId)
      .select(contextItemColumns)
      .maybeSingle();

    if (error) {
      throw new PersonalContextRepositoryError("update_item", error.code);
    }

    return data ? mapItem(data) : null;
  }

  async deleteItem(itemId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("personal_context_items")
      .delete()
      .eq("id", itemId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new PersonalContextRepositoryError("delete_item", error.code);
    }

    return data !== null;
  }
}
