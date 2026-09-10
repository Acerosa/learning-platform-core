import { PlatformError, mapPlatformError } from "../errors/platform-error.js";
import { isHubEnrolledStatus } from "../hub-access/hub-access-service.js";

const SAFE_PENDING_FIELDS = Object.freeze(["firstName", "surname", "studentNumber", "registrationKey"]);
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateProfile(details = {}) {
  const value = {
    firstName: clean(details.firstName),
    surname: clean(details.surname),
    studentNumber: clean(details.studentNumber)
  };
  if (!value.firstName || value.firstName.length > 100) return { ok: false, code: "INVALID_FIRST_NAME" };
  if (!value.surname || value.surname.length > 100) return { ok: false, code: "INVALID_SURNAME" };
  if (!value.studentNumber || value.studentNumber.length > 100) return { ok: false, code: "INVALID_STUDENT_NUMBER" };
  return { ok: true, value };
}

function validateEmail(email) {
  const value = clean(email);
  if (!EMAIL_PATTERN.test(value)) return { ok: false, code: "INVALID_EMAIL" };
  return { ok: true, value };
}

function validateAccount(details = {}) {
  const emailCheck = validateEmail(details.email);
  if (!emailCheck.ok) return emailCheck;
  const password = typeof details.password === "string" ? details.password : "";
  if (password.length < 8) return { ok: false, code: "WEAK_PASSWORD" };
  return { ok: true, value: { email: emailCheck.value, password } };
}

export function createOnboardingService({ api, authService, learnerContext, storage = globalThis.sessionStorage, pendingKey = "learning-platform.pending-onboarding.v1", hubAccessService } = {}) {
  function safePending(details = {}) {
    const checked = validateProfile(details);
    if (!checked.ok) throw new PlatformError({ code: checked.code, category: "validation" });
    const pending = { ...checked.value };
    if (clean(details.registrationKey)) pending.registrationKey = clean(details.registrationKey);
    return Object.freeze(pending);
  }

  function savePending(details) {
    const pending = safePending(details);
    try { storage?.setItem(pendingKey, JSON.stringify(pending)); } catch {}
    return pending;
  }

  function getPending() {
    try {
      const raw = storage?.getItem(pendingKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const allowed = Object.fromEntries(SAFE_PENDING_FIELDS.map((key) => [key, parsed?.[key]]));
      return safePending(allowed);
    } catch {
      clearPending();
      return null;
    }
  }

  function clearPending() {
    try { storage?.removeItem(pendingKey); } catch {}
  }

  function requireSession() {
    if (!authService.isSignedIn()) {
      throw new PlatformError({ code: "AUTH_REQUIRED", category: "authentication" });
    }
  }

  async function getRegistrationOptions() {
    requireSession();
    return Object.freeze([]);
  }

  async function complete(details) {
    requireSession();
    const checked = validateProfile(details);
    if (!checked.ok) throw new PlatformError({ code: checked.code, category: "validation" });

    // Existing linked learners must join hubs via joinClass only. Skip the
    // profile RPC when Core already resolved a learner profile for this Auth.
    const learnerState = learnerContext?.getState?.();
    const existingNumber = clean(learnerState?.context?.studentNumber);
    if (
      learnerState?.status === "authenticated"
      && existingNumber
      && existingNumber === checked.value.studentNumber
    ) {
      clearPending();
      return Object.freeze({
        student_number: existingNumber,
        first_name: learnerState.context?.firstName || checked.value.firstName,
        surname: learnerState.context?.surname || checked.value.surname,
        idempotent: true
      });
    }

    try {
      const result = await api.completeOnboarding({
        p_first_name: checked.value.firstName,
        p_surname: checked.value.surname,
        p_student_number: checked.value.studentNumber,
        p_registration_option: ""
      });
      clearPending();
      await learnerContext?.refresh?.();
      if (hubAccessService) {
        const access = await hubAccessService.resolve();
        if (isHubEnrolledStatus(access.status) && access.groupCode) {
          await learnerContext?.refresh?.({ preferredGroupCode: access.groupCode });
        }
      }
      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      throw mapPlatformError(error, { operation: "complete-onboarding" });
    }
  }

  async function joinClass(classKey) {
    requireSession();
    // Stored keys are lowercase kebab-case; learner input may be mixed case.
    const key = clean(classKey).toLowerCase();
    if (!key) throw new PlatformError({ code: "INVALID_CLASS_KEY", category: "validation" });
    if (!hubAccessService?.join) {
      throw new PlatformError({
        code: "JOIN_CLASS_UNAVAILABLE",
        category: "configuration",
        learnerMessage: "Join class is unavailable right now. Try again shortly."
      });
    }
    try {
      const access = await hubAccessService.join(key);
      await learnerContext?.refresh?.({ preferredGroupCode: access.groupCode || undefined });
      return access;
    } catch (error) {
      throw mapPlatformError(error, {
        operation: "join-class",
        learnerMessage: "Could not join your class. Check the registration key and try again."
      });
    }
  }

  return Object.freeze({
    validateProfile,
    validateAccount,
    validateEmail,
    savePending,
    getPending,
    clearPending,
    getRegistrationOptions,
    complete,
    joinClass,
    pendingKey
  });
}
