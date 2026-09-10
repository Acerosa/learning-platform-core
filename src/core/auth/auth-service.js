import { mapPlatformError, PlatformError } from "../errors/platform-error.js";
import { cleanAuthCallbackFromUrl } from "./auth-redirect-url.js";

export function createAuthService({ client, logger, resolveRedirectUrl, cleanAuthCallback } = {}) {
  if (!client?.auth) {
    throw new PlatformError({ code: "SUPABASE_AUTH_REQUIRED", category: "configuration" });
  }
  let state = Object.freeze({ status: "loading", session: null, error: null });
  let initialised = false;
  let initialisePromise = null;
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

  async function initialise() {
    if (initialisePromise) return initialisePromise;
    if (initialised) return state;
    initialised = true;
    client.auth.onAuthStateChange?.((event, session) => {
      if (event === "SIGNED_OUT" || !session) publish({ status: "signed-out", session: null, error: null });
      else publish({ status: "authenticated", session, error: null });
    });
    initialisePromise = client.auth.getSession()
      .then((result) => {
        if (result.error) throw result.error;
        const session = result.data?.session || null;
        if (session) {
          try {
            if (typeof cleanAuthCallback === "function") cleanAuthCallback();
            else cleanAuthCallbackFromUrl(globalThis.location, globalThis.history);
          } catch (error) {
            logger?.warn("auth.callback-url.cleanup.failed", { code: error?.code });
          }
        }
        return publish({ status: session ? "authenticated" : "signed-out", session, error: null });
      })
      .catch((error) => {
        const mapped = mapPlatformError(error, { operation: "restore-session" });
        publish({ status: "error", session: null, error: mapped });
        throw mapped;
      })
      .finally(() => { initialisePromise = null; });
    return initialisePromise;
  }

  async function signIn(email, password) {
    publish({ status: "signing-in", error: null });
    try {
      const result = await client.auth.signInWithPassword({ email: String(email || "").trim(), password });
      if (result.error) throw result.error;
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
      publish({ status: "signed-out", session: null, error: null });
    }
    return true;
  }

  /**
   * Refresh the current hub's Auth session tokens only.
   * Does not touch other hubs' per-hub storage keys.
   */
  async function refreshSession() {
    try {
      const result = await client.auth.refreshSession();
      if (result?.error) throw result.error;
      const session = result?.data?.session || null;
      if (!session) {
        await signOut();
        throw new PlatformError({
          code: "SESSION_REFRESH_REQUIRED",
          category: "authentication",
          learnerMessage: "Your session needs to be refreshed. Please sign in again."
        });
      }
      return publish({ status: "authenticated", session, error: null });
    } catch (error) {
      const mapped = mapPlatformError(error, {
        operation: "refresh-session",
        category: "authentication",
        learnerMessage: "Your session needs to be refreshed. Please sign in again."
      });
      await signOut();
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
