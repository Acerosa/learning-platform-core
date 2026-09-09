import { PlatformError } from "../errors/platform-error.js";
import { createAuthStorageKey, PROJECT_URL } from "../auth/auth-storage-key.js";

export function createSupabaseClient(config = {}, dependencies = {}) {
  if (dependencies.client) return dependencies.client;
  const projectUrl = typeof config.projectUrl === "string" ? config.projectUrl.trim().replace(/\/+$/, "") : "";
  const publishableKey = typeof config.publishableKey === "string" ? config.publishableKey.trim() : "";
  const hubCode = typeof config.hubCode === "string" ? config.hubCode.trim() : "";
  if (!PROJECT_URL.test(projectUrl) || !publishableKey) {
    throw new PlatformError({ code: "INVALID_SUPABASE_CONFIGURATION", category: "configuration" });
  }

  const createClient = dependencies.createClient || globalThis.supabase?.createClient;
  if (typeof createClient !== "function") {
    throw new PlatformError({ code: "SUPABASE_SDK_UNAVAILABLE", category: "configuration" });
  }

  const auth = {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: createAuthStorageKey(projectUrl, hubCode)
  };
  if (dependencies.authStorage) {
    auth.storage = dependencies.authStorage;
  }

  return createClient(projectUrl, publishableKey, { auth });
}
