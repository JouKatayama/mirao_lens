import { createHash, randomBytes } from "node:crypto";

import {
  createHubSpotStore,
  createUserScopedSupabaseClient,
  type HubSpotStore,
} from "@miraio/db";
import { hubSpotExportRequestSchema } from "@miraio/domain";

import { readCleanupConfig, readServerSupabaseConfig } from "./server-config";
import {
  authorizationUrl,
  decryptTokens,
  encryptTokens,
  HubSpotProvider,
  readHubSpotConfig,
  type HubSpotConfig,
} from "./hubspot-provider";

type StorePort = Pick<
  HubSpotStore,
  | "saveState"
  | "consumeState"
  | "saveConnection"
  | "getConnection"
  | "deleteConnection"
  | "hasOwnedScan"
  | "saveContactExport"
  | "claimNote"
  | "markNoteSent"
  | "getExport"
>;

export type HubSpotDependencies = {
  authenticate(token: string): Promise<string | null>;
  store(): StorePort;
  provider: HubSpotProvider;
  config(): HubSpotConfig;
};

const headers = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
const fail = (code: string, status: number) =>
  json(
    { error: { code, message: "The request could not be completed." } },
    status,
  );

function bearer(request: Request): string | null {
  return (
    /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ??
    null
  );
}

async function userFor(
  request: Request,
  dependencies: HubSpotDependencies,
): Promise<string | Response> {
  const token = bearer(request);
  if (!token) return fail("unauthorized", 401);
  try {
    return (
      (await dependencies.authenticate(token)) ?? fail("unauthorized", 401)
    );
  } catch {
    return fail("authentication_unavailable", 500);
  }
}

export function createHubSpotAuthorizeHandler(
  dependencies: HubSpotDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const userId = await userFor(request, dependencies);
    if (userId instanceof Response) return userId;
    try {
      const config = dependencies.config();
      const state = randomBytes(32).toString("base64url");
      const stateHash = createHash("sha256").update(state).digest("hex");
      await dependencies
        .store()
        .saveState(
          stateHash,
          userId,
          new Date(Date.now() + 10 * 60_000).toISOString(),
        );
      return json({ authorization_url: authorizationUrl(config, state) });
    } catch {
      return fail("hubspot_unconfigured", 503);
    }
  };
}

export function createHubSpotCallbackHandler(
  dependencies: HubSpotDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!state || !code || state.length > 200 || code.length > 2000)
      return fail("invalid_callback", 400);
    try {
      const stateHash = createHash("sha256").update(state).digest("hex");
      const store = dependencies.store();
      const userId = await store.consumeState(stateHash);
      if (!userId) return fail("invalid_callback", 400);
      const config = dependencies.config();
      const tokens = await dependencies.provider.exchangeCode(config, code);
      await store.saveConnection(
        userId,
        tokens.hub_id,
        encryptTokens(tokens, config.tokenKey),
        new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      );
      return new Response("HubSpot connected. Return to Miraio Lens.", {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    } catch {
      return fail("hubspot_callback_failed", 502);
    }
  };
}

export function createHubSpotStatusHandler(dependencies: HubSpotDependencies) {
  return async (request: Request): Promise<Response> => {
    const userId = await userFor(request, dependencies);
    if (userId instanceof Response) return userId;
    try {
      const connection = await dependencies.store().getConnection(userId);
      return json({
        connected: Boolean(connection),
        hub_id: connection?.hub_id ?? null,
      });
    } catch {
      return fail("hubspot_status_failed", 500);
    }
  };
}

export function createHubSpotDisconnectHandler(
  dependencies: HubSpotDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const userId = await userFor(request, dependencies);
    if (userId instanceof Response) return userId;
    try {
      const store = dependencies.store();
      const connection = await store.getConnection(userId);
      if (connection) {
        const config = dependencies.config();
        const tokens = decryptTokens(
          connection.encrypted_tokens,
          config.tokenKey,
        );
        await dependencies.provider.revoke(config, tokens.refresh_token);
      }
      await store.deleteConnection(userId);
      return json({ connected: false });
    } catch {
      return fail("hubspot_disconnect_failed", 500);
    }
  };
}

export function createHubSpotExportHandler(dependencies: HubSpotDependencies) {
  return async (request: Request): Promise<Response> => {
    const userId = await userFor(request, dependencies);
    if (userId instanceof Response) return userId;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("invalid_json", 400);
    }
    const parsed = hubSpotExportRequestSchema.safeParse(body);
    if (!parsed.success) return fail("invalid_export", 400);
    try {
      const store = dependencies.store();
      if (!(await store.hasOwnedScan(userId, parsed.data.scan_id)))
        return fail("not_found", 404);
      const connection = await store.getConnection(userId);
      if (!connection) return fail("hubspot_not_connected", 409);
      const config = dependencies.config();
      let tokens = decryptTokens(connection.encrypted_tokens, config.tokenKey);
      if (
        new Date(connection.access_expires_at).getTime() <
        Date.now() + 2 * 60_000
      ) {
        tokens = await dependencies.provider.refresh(
          config,
          tokens.refresh_token,
        );
        await store.saveConnection(
          userId,
          tokens.hub_id,
          encryptTokens(tokens, config.tokenKey),
          new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        );
      }
      const contactId = await dependencies.provider.upsertContact(
        tokens.access_token,
        parsed.data.contact,
      );
      await store.saveContactExport(
        userId,
        parsed.data.scan_id,
        connection.hub_id,
        contactId,
      );

      const noteBody = [
        parsed.data.reviewed_note,
        parsed.data.reviewed_action &&
          `Next Action: ${parsed.data.reviewed_action}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      if (
        noteBody &&
        (await store.claimNote(userId, parsed.data.scan_id, connection.hub_id))
      ) {
        // A lost response cannot prove whether HubSpot created the note. The
        // 'sending' state prevents an automatic retry from duplicating it.
        const noteId = await dependencies.provider.createNote(
          tokens.access_token,
          contactId,
          noteBody,
        );
        await store.markNoteSent(
          userId,
          parsed.data.scan_id,
          connection.hub_id,
          noteId,
        );
      }
      const exportRecord = await store.getExport(
        userId,
        parsed.data.scan_id,
        connection.hub_id,
      );
      return json({
        contact_id: contactId,
        note_status: exportRecord?.note_status ?? "none",
      });
    } catch {
      return fail("hubspot_export_failed", 502);
    }
  };
}

export function HUBSPOT_OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export const productionHubSpotDependencies: HubSpotDependencies = {
  async authenticate(token) {
    const client = createUserScopedSupabaseClient(
      readServerSupabaseConfig(process.env),
      token,
    );
    const { data, error } = await client.auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  },
  store() {
    const config = readCleanupConfig(process.env);
    return createHubSpotStore(config.supabaseUrl, config.serviceRoleKey);
  },
  provider: new HubSpotProvider(),
  config() {
    return readHubSpotConfig(process.env);
  },
};
