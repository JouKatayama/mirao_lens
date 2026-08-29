import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@miraio/db";
import {
  createClient,
  processLock,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";

import { readMobileSupabaseConfig } from "./supabase-config";

export type MobileSupabaseClient = SupabaseClient<Database>;

let client: MobileSupabaseClient | undefined;
let authRefreshListenerRegistered = false;

export function getSupabaseClient(): MobileSupabaseClient {
  if (client) {
    return client;
  }

  const config = readMobileSupabaseConfig(process.env);

  client = createClient<Database>(config.url, config.publishableKey, {
    auth: {
      ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      detectSessionInUrl: false,
      lock: processLock,
      persistSession: true,
    },
  });

  if (Platform.OS !== "web" && !authRefreshListenerRegistered) {
    authRefreshListenerRegistered = true;

    AppState.addEventListener("change", (state) => {
      if (state === "active") {
        client?.auth.startAutoRefresh();
      } else {
        client?.auth.stopAutoRefresh();
      }
    });
  }

  return client;
}
