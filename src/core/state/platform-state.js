import { PlatformError } from "../errors/platform-error.js";

export const PLATFORM_STATES = Object.freeze([
  "loading",
  "signed-out",
  "signing-in",
  "registration-required",
  "onboarding-required",
  "authenticated",
  "no-enrolment",
  "no-assignments",
  "ready",
  "offline",
  "error"
]);

export function derivePlatformState({
  online = true,
  loading = false,
  signingIn = false,
  session = null,
  registrationRequired = false,
  profile = null,
  enrolments = [],
  assignments = [],
  error = null
} = {}) {
  if (error) return "error";
  if (!online) return "offline";
  if (loading) return "loading";
  if (signingIn) return "signing-in";
  if (!session) return registrationRequired ? "registration-required" : "signed-out";
  if (!profile) return "onboarding-required";
  if (!Array.isArray(enrolments) || enrolments.length === 0) return "no-enrolment";
  if (!Array.isArray(assignments) || assignments.length === 0) return "no-assignments";
  return "ready";
}

export function createPlatformState(initial = "loading") {
  if (!PLATFORM_STATES.includes(initial)) {
    throw new PlatformError({ code: "INVALID_PLATFORM_STATE", category: "configuration" });
  }
  let current = Object.freeze({ status: initial, detail: null, changedAt: new Date().toISOString() });
  const listeners = new Set();

  function transition(status, detail = null) {
    if (!PLATFORM_STATES.includes(status)) {
      throw new PlatformError({ code: "INVALID_PLATFORM_STATE", category: "platform" });
    }
    current = Object.freeze({ status, detail, changedAt: new Date().toISOString() });
    listeners.forEach((listener) => listener(current));
    return current;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener(current);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    getState: () => current,
    transition,
    subscribe
  });
}
