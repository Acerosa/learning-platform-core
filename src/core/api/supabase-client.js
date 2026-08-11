import { PlatformError } from "../errors/platform-error.js";

const PROJECT_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;

export function createSupabaseClient(config = {}, dependencies = {}) {
  if (dependencies.client) return dependencies.client;
  const projectUrl = typeof config.projectUrl === "string" ? config.projectUrl.trim().replace(/\/+$/, "") : "";
  const publishableKey = typeof config.publishableKey === "string" ? config.publishableKey.trim() : "";
  if (!PROJECT_URL.test(projectUrl) || !publishableKey) {
    throw new PlatformError({ code: "INVALID_SUPABASE_CONFIGURATION", category: "configuration" });
  }

  const createClient = dependencies.createClient || globalThis.supabase?.createClient;
  if (typeof createClient !== "function") {
    throw new PlatformError({ code: "SUPABASE_SDK_UNAVAILABLE", category: "configuration" });
  }

  return createClient(projectUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
