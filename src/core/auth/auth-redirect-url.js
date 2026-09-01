import { PlatformError } from "../errors/platform-error.js";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const AUTH_HASH_KEYS = new Set([
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "type",
  "provider_token",
  "provider_refresh_token"
]);

function cleanRelativeRoot(value) {
  const root = typeof value === "string" ? value.trim() : "";
  if (!root) return "./";
  if (/^[a-z]+:/i.test(root) || root.startsWith("//") || root.includes("?") || root.includes("#")) {
    throw new PlatformError({ code: "INVALID_AUTH_REDIRECT", category: "configuration" });
  }
  return root.endsWith("/") ? root : `${root}/`;
}

function canonicalSameOriginUrl(origin, pathname) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const withSlash = path.endsWith("/") ? path : `${path}/`;
  return `${origin}${withSlash}`;
}

/**
 * Resolve the canonical hub landing URL for Supabase email confirmation redirects.
 * Uses only origin + pathname from the current location and a trusted relative hub root.
 * Ignores query strings, URL fragments, and user-supplied redirect parameters.
 */
export function resolveAuthRedirectUrl({ location, hubRootPath = "./" } = {}) {
  if (!location || typeof location.href !== "string") return null;
  if (!ALLOWED_PROTOCOLS.has(location.protocol)) {
    throw new PlatformError({ code: "INVALID_AUTH_REDIRECT", category: "configuration" });
  }

  const origin = location.origin;
  const relativeRoot = cleanRelativeRoot(hubRootPath);
  const basePathname = location.pathname || "/";
  const baseHref = `${origin}${basePathname.endsWith("/") ? basePathname : `${basePathname}/`}`;

  let resolved;
  try {
    resolved = new URL(relativeRoot, baseHref);
  } catch {
    throw new PlatformError({ code: "INVALID_AUTH_REDIRECT", category: "configuration" });
  }

  if (resolved.origin !== origin) {
    throw new PlatformError({ code: "AUTH_REDIRECT_CROSS_ORIGIN", category: "configuration" });
  }

  return canonicalSameOriginUrl(origin, resolved.pathname);
}

/**
 * Remove Supabase auth callback tokens from the address bar after session recovery.
 * Does not run before the Supabase client has consumed the hash.
 */
export function cleanAuthCallbackFromUrl(location, history) {
  if (!location || typeof history?.replaceState !== "function") return false;
  const rawHash = String(location.hash || "");
  if (!rawHash.startsWith("#")) return false;

  const params = new URLSearchParams(rawHash.slice(1));
  const hasAuthMaterial = Array.from(params.keys()).some((key) => AUTH_HASH_KEYS.has(key));
  if (!hasAuthMaterial) return false;

  const pathname = location.pathname || "/";
  const cleanPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
  history.replaceState(history.state, "", cleanPath);
  return true;
}
