import { mapPlatformError, PlatformError } from "../errors/platform-error.js";
import { cleanAuthCallbackFromUrl } from "./auth-redirect-url.js";
import { isRetryableAuthNetworkError, isStaleAuthSessionError } from "./stale-auth-session.js";

const STALE_SESSION_COPY = "Your previous session is no longer valid. Please sign in again.";

function staleSessionError(cause) {
  return new PlatformError({
    code: "AUTH_SESSION_STALE",
    category: "authentication",
    learnerMessage: STALE_SESSION_COPY,
    diagnostic: {
      operation: "validate-session",
      status: Number.isFinite(cause?.status) ? cause.status : null,
      sourceCode: String(cause?.code || cause?.name || "AUTH_SESSION_STALE")
    },
    cause
  });
}

export function createAuthService({ client, logger, resolveRedirectUrl, cleanAuthCallback } = {}) {
  if (!client?.auth) {
    throw new PlatformError({ code: "SUPABASE_AUTH_REQUIRED", category: "configuration" });
  }
  let state = Object.freeze({ status: "loading", session: null, error: null });
  let initialised = false;
  let initialisePromise = null;
  /** Blocks onAuthStateChange from publishing until restore validation finishes once. */
  let restoreComplete = false;
  /** Guards against repeated local sign-out / getUser recovery attempts. */
  let staleRecoveryAttempted = false;
  const listeners = new Set();

  function publish(next) {
    state = Object.freeze({ ...state, ...next });
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  function cleanCallbackUrl() {
    try {
      if (typeof cleanAuthCallback === "function") cleanAuthCallback();
      else cleanAuthCallbackFromUrl(globalThis.location, globalThis.history);
    } catch (error) {
      logger?.warn("auth.callback-url.cleanup.failed", { code: error?.code });
    }
  }

  /**
   * Local hub sign-out for a deleted/invalid Auth identity.
   * Clears only this client's storage key (scope: local). Idempotent.
   */
  async function recoverStaleSession(cause) {
    const mapped = staleSessionError(cause);
    if (staleRecoveryAttempted && !state.session) {
      return publish({ status: "signed-out", session: null, error: mapped });
    }
    staleRecoveryAttempted = true;
    logger?.warn("auth.session.stale", {
      code: cause?.code || cause?.name || "AUTH_SESSION_STALE",
      status: cause?.status ?? null
    });
    try {
      await client.auth.signOut({ scope: "local" });
    } catch (error) {
      logger?.warn("auth.stale-sign-out.failed", { code: error?.code || error?.name });
    }
    return publish({ status: "signed-out", session: null, error: mapped });
  }

  /**
   * Prove a cached local session still maps to a live Auth user.
   * getSession() alone is not authoritative after server-side user deletion.
   */
  async function validateCachedSession(session) {
    if (typeof client.auth.getUser !== "function") {
      return { ok: true, session };
    }
    let result;
    try {
      result = await client.auth.getUser();
    } catch (error) {
      if (isRetryableAuthNetworkError(error)) {
        return { ok: false, network: true, error };
      }
      if (isStaleAuthSessionError(error)) {
        return { ok: false, stale: true, error };
      }
      throw error;
    }
    if (result?.error) {
      if (isRetryableAuthNetworkError(result.error)) {
        return { ok: false, network: true, error: result.error };
      }
      if (isStaleAuthSessionError(result.error)) {
        return { ok: false, stale: true, error: result.error };
      }
      // Unknown Auth API failure with an HTTP identity rejection → treat as stale.
      const status = Number(result.error.status);
      if (status === 401 || status === 403) {
        return { ok: false, stale: true, error: result.error };
      }
      return { ok: false, network: true, error: result.error };
    }
    if (!result?.data?.user) {
      return {
        ok: false,
        stale: true,
        error: { code: "user_not_found", message: "Auth user missing", status: 403 }
      };
    }
    return { ok: true, session, user: result.data.user };
  }

  async function initialise() {
    if (initialisePromise) return initialisePromise;
    if (initialised) return state;
    initialised = true;
    restoreComplete = false;
    client.auth.onAuthStateChange?.((event, session) => {
      // Ignore events until restore validation publishes its first authoritative state.
      // Otherwise INITIAL_SESSION can mark authenticated for a deleted Auth user.
      if (!restoreComplete) return;
      if (event === "SIGNED_OUT" || !session) {
        const keepStale = state.error?.code === "AUTH_SESSION_STALE" ? state.error : null;
        publish({ status: "signed-out", session: null, error: keepStale });
      } else {
        publish({ status: "authenticated", session, error: null });
      }
    });
    initialisePromise = (async () => {
      try {
        const result = await client.auth.getSession();
        if (result.error) throw result.error;
        const session = result.data?.session || null;
        if (!session) {
          restoreComplete = true;
          return publish({ status: "signed-out", session: null, error: null });
        }

        const validation = await validateCachedSession(session);
        if (validation.stale) {
          restoreComplete = true;
          return recoverStaleSession(validation.error);
        }
        if (validation.network) {
          const mapped = mapPlatformError(validation.error, {
            operation: "validate-session",
            category: "network"
          });
          restoreComplete = true;
          // Keep the cached session for retry; do not claim learner readiness.
          return publish({ status: "error", session, error: mapped });
        }

        cleanCallbackUrl();
        restoreComplete = true;
        staleRecoveryAttempted = false;
        return publish({ status: "authenticated", session, error: null });
      } catch (error) {
        if (isRetryableAuthNetworkError(error)) {
          const mapped = mapPlatformError(error, {
            operation: "restore-session",
            category: "network"
          });
          restoreComplete = true;
          return publish({ status: "error", session: state.session, error: mapped });
        }
        if (isStaleAuthSessionError(error)) {
          restoreComplete = true;
          return recoverStaleSession(error);
        }
        const mapped = mapPlatformError(error, { operation: "restore-session" });
        restoreComplete = true;
        publish({ status: "error", session: null, error: mapped });
        throw mapped;
      } finally {
        initialisePromise = null;
      }
    })();
    return initialisePromise;
  }

  async function signIn(email, password) {
    publish({ status: "signing-in", error: null });
    try {
      const result = await client.auth.signInWithPassword({ email: String(email || "").trim(), password });
      if (result.error) throw result.error;
      staleRecoveryAttempted = false;
      restoreComplete = true;
      return publish({ status: "authenticated", session: result.data?.session || null, error: null });
    } catch (error) {
      const mapped = mapPlatformError(error, { operation: "sign-in", category: "authentication" });
      publish({ status: "signed-out", session: null, error: mapped });
      throw mapped;
    }
  }

  async function signUp(email, password) {
    publish({ status: "signing-in", error: null });
    try {
      const payload = { email: String(email || "").trim(), password };
      const emailRedirectTo = typeof resolveRedirectUrl === "function" ? resolveRedirectUrl() : null;
      if (emailRedirectTo) {
        payload.options = { emailRedirectTo };
      }
      const result = await client.auth.signUp(payload);
      if (result.error) throw result.error;
      const session = result.data?.session || null;
      const user = result.data?.user || null;
      const identities = Array.isArray(user?.identities) ? user.identities : null;
      const existingAccount = Boolean(user) && !session && Array.isArray(identities) && identities.length === 0;
      restoreComplete = true;
      publish({ status: session ? "authenticated" : "signed-out", session, error: null });
      return Object.freeze({
        user,
        session,
        needsConfirmation: !session && !existingAccount,
        existingAccount
      });
    } catch (error) {
      const mapped = mapPlatformError(error, { operation: "sign-up", category: "authentication" });
      publish({ status: "signed-out", session: null, error: mapped });
      throw mapped;
    }
  }

  async function signOut() {
    try {
      // Local scope clears only this client's persisted session. Global sign-out
      // would revoke every refresh token for the Auth user, including other hubs.
      const result = await client.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
    } catch (error) {
      logger?.warn("auth.sign-out.failed", { code: error?.code });
    } finally {
      restoreComplete = true;
      publish({ status: "signed-out", session: null, error: null });
    }
    return true;
  }

  /**
   * Refresh the current hub's Auth session tokens only.
   * Does not touch other hubs' per-hub storage keys.
   * Terminal Auth errors clear this hub only; network failures keep the session.
   */
  async function refreshSession() {
    try {
      const result = await client.auth.refreshSession();
      if (result?.error) throw result.error;
      const session = result?.data?.session || null;
      if (!session) {
        await recoverStaleSession({
          code: "SESSION_REFRESH_REQUIRED",
          message: "No session returned from refresh",
          status: 400
        });
        throw new PlatformError({
          code: "SESSION_REFRESH_REQUIRED",
          category: "authentication",
          learnerMessage: "Your session needs to be refreshed. Please sign in again."
        });
      }
      staleRecoveryAttempted = false;
      return publish({ status: "authenticated", session, error: null });
    } catch (error) {
      if (error instanceof PlatformError && error.code === "SESSION_REFRESH_REQUIRED") throw error;
      if (isRetryableAuthNetworkError(error)) {
        const mapped = mapPlatformError(error, {
          operation: "refresh-session",
          category: "network",
          learnerMessage: "The learner service could not be reached. Check your connection and try again."
        });
        publish({ status: "error", session: state.session, error: mapped });
        throw mapped;
      }
      if (isStaleAuthSessionError(error) || Number(error?.status) === 401 || Number(error?.status) === 403) {
        await recoverStaleSession(error);
        throw staleSessionError(error);
      }
      const mapped = mapPlatformError(error, {
        operation: "refresh-session",
        category: "authentication",
        learnerMessage: "Your session needs to be refreshed. Please sign in again."
      });
      await recoverStaleSession(error);
      throw mapped;
    }
  }

  return Object.freeze({
    initialise,
    signIn,
    signUp,
    signOut,
    refreshSession,
    subscribe,
    getState: () => state,
    getSession: () => state.session,
    isSignedIn: () => Boolean(state.session)
  });
}

export { STALE_SESSION_COPY };
