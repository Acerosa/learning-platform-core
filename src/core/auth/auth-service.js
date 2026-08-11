import { mapPlatformError, PlatformError } from "../errors/platform-error.js";

export function createAuthService({ client, logger } = {}) {
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
      const result = await client.auth.signUp({ email: String(email || "").trim(), password });
      if (result.error) throw result.error;
      const session = result.data?.session || null;
      publish({ status: session ? "authenticated" : "signed-out", session, error: null });
      return Object.freeze({ user: result.data?.user || null, session, needsConfirmation: !session });
    } catch (error) {
      const mapped = mapPlatformError(error, { operation: "sign-up", category: "authentication" });
      publish({ status: "signed-out", session: null, error: mapped });
      throw mapped;
    }
  }

  async function signOut() {
    try {
      const result = await client.auth.signOut();
      if (result?.error) throw result.error;
    } catch (error) {
      logger?.warn("auth.sign-out.failed", { code: error?.code });
    } finally {
      publish({ status: "signed-out", session: null, error: null });
    }
    return true;
  }

  return Object.freeze({
    initialise,
    signIn,
    signUp,
    signOut,
    subscribe,
    getState: () => state,
    getSession: () => state.session,
    isSignedIn: () => Boolean(state.session)
  });
}
