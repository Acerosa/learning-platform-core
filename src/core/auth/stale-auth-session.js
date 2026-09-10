/**
 * Authoritative signals that a cached Auth session is terminal / unusable.
 * Based on GoTrue behaviour when the Auth user (or refresh token) no longer exists.
 *
 * Observed for deleted Auth users (access token still locally cached):
 * - getUser() → AuthApiError status 403 code `user_not_found`
 *   message "User from sub claim in JWT does not exist"
 * - refreshSession() → AuthApiError status 400 code `refresh_token_not_found`
 *
 * Do NOT treat empty my_profile / missing learner as stale Auth — that is
 * genuine identity onboarding after Auth has been proven valid.
 */

const STALE_CODES = new Set([
  "user_not_found",
  "refresh_token_not_found",
  "session_not_found",
  "bad_jwt",
  "invalid_jwt",
  "auth_session_stale"
]);

const STALE_MESSAGE_PATTERNS = [
  /user from sub claim .* does not exist/i,
  /refresh token not found/i,
  /invalid refresh token/i,
  /auth session missing/i
];

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isStaleAuthSessionError(error) {
  if (!error || typeof error !== "object") return false;
  const code = String(/** @type {{ code?: unknown }} */ (error).code || "").toLowerCase();
  if (STALE_CODES.has(code)) return true;

  const name = String(/** @type {{ name?: unknown }} */ (error).name || "");
  if (name === "AuthSessionMissingError") return true;

  const message = String(/** @type {{ message?: unknown }} */ (error).message || "");
  return STALE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Transient failures must not clear a hub session.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isRetryableAuthNetworkError(error) {
  if (!error || typeof error !== "object") return false;
  const err = /** @type {{ name?: unknown, message?: unknown, code?: unknown, status?: unknown }} */ (error);
  const name = String(err.name || "");
  if (name === "AuthRetryableFetchError") return true;

  const status = Number(err.status);
  if (status === 0) return true;
  if (Number.isFinite(status) && status >= 500) return true;

  const code = String(err.code || "");
  const message = String(err.message || "");
  return /NETWORK|FETCH|TIMEOUT|ABORT|OFFLINE|FAILED TO FETCH/i.test(`${code} ${message}`);
}
