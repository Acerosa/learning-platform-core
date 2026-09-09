import { PlatformError } from "../errors/platform-error.js";

const PROJECT_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
const HUB_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Deterministic per-hub Auth persistence key.
 *
 * Matches the Supabase JS 2.112.3 default prefix (`sb-<project-ref>-auth-token`)
 * and appends the canonical hub code so same-origin GitHub Pages hubs do not
 * share one browser session. This is persistence isolation only, not an
 * authorisation boundary.
 */
export function createAuthStorageKey(projectUrl, hubCode) {
  const url = typeof projectUrl === "string" ? projectUrl.trim().replace(/\/+$/, "") : "";
  const code = typeof hubCode === "string" ? hubCode.trim() : "";
  if (!PROJECT_URL.test(url)) {
    throw new PlatformError({ code: "INVALID_SUPABASE_CONFIGURATION", category: "configuration" });
  }
  if (!HUB_CODE_PATTERN.test(code)) {
    throw new PlatformError({ code: "INVALID_HUB_CODE", category: "configuration" });
  }
  const projectRef = new URL(url).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token--${code}`;
}

export { PROJECT_URL };
