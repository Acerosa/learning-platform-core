import { sleep } from "../progress/activity-state-errors.js";

export const SESSION_PENDING_CODE = "SESSION_PENDING";
export const DEFAULT_PERSIST_AUTH_WAIT_MS = 8000;

export function sessionIdentityReady(auth) {
  if (!auth || typeof auth.isSignedIn !== "function" || auth.isSignedIn() !== true) return false;
  if (typeof auth.getSession !== "function") return true;
  try {
    const session = auth.getSession();
    if (!session) return false;
    if (session.user?.id) return true;
    return false;
  } catch {
    return false;
  }
}

export function authStatus(auth) {
  try {
    const state = typeof auth?.getState === "function" ? auth.getState() : null;
    return String(state?.status || "");
  } catch {
    return "";
  }
}

/**
 * Wait until a signed-in learner has a user id, or until timeout.
 * Guests (never signed in, not loading) resolve immediately as not ready.
 * A still-loading or signed-in-without-id session is retryable SESSION_PENDING.
 */
function sessionObjectPresent(auth) {
  if (typeof auth?.getSession !== "function") return false;
  try {
    return Boolean(auth.getSession());
  } catch {
    return false;
  }
}

function identityRestoreInProgress(auth) {
  if (!auth || typeof auth.isSignedIn !== "function") return false;
  if (auth.isSignedIn() === true) return true;
  const status = authStatus(auth);
  if (status === "signing-in") return true;
  // Generic "loading" with no session is first-paint unsigned, not restore.
  return sessionObjectPresent(auth);
}

export async function waitForSessionIdentity(auth, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_PERSIST_AUTH_WAIT_MS;
  const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout.bind(globalThis);
  if (!auth || typeof auth.isSignedIn !== "function") {
    return { ready: false, signedIn: false, pending: false };
  }
  if (sessionIdentityReady(auth)) {
    return { ready: true, signedIn: true, pending: false };
  }
  if (!identityRestoreInProgress(auth)) {
    return { ready: false, signedIn: false, pending: false };
  }

  const started = Date.now();
  let delay = 25;
  while (Date.now() - started < timeoutMs) {
    if (sessionIdentityReady(auth)) {
      return { ready: true, signedIn: true, pending: false };
    }
    if (!identityRestoreInProgress(auth)) {
      return { ready: false, signedIn: auth.isSignedIn() === true, pending: false };
    }
    await sleep(delay, setTimeoutFn);
    delay = Math.min(delay * 2, 200);
  }

  return {
    ready: sessionIdentityReady(auth),
    signedIn: auth.isSignedIn() === true,
    pending: !sessionIdentityReady(auth) && identityRestoreInProgress(auth)
  };
}
