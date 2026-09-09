import { PlatformError, mapPlatformError } from "../errors/platform-error.js";

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

  function mapOptions(rows) {
    return Object.freeze((Array.isArray(rows) ? rows : []).map((row) => Object.freeze({
      registrationKey: clean(row.registration_option ?? row.registrationKey),
      academicYear: clean(row.academic_year ?? row.academicYear),
      yearGroup: clean(row.year_group ?? row.yearGroup),
      courseTitle: clean(row.course_title ?? row.courseTitle),
      groupCode: clean(row.group_code ?? row.groupCode),
      groupName: clean(row.group_name ?? row.groupName)
    })).filter((option) => option.registrationKey && option.yearGroup));
  }

  async function getRegistrationOptions() {
    requireSession();
    if (hubAccessService) {
      const access = await hubAccessService.resolve();
      if (access.registrationOption) {
        return mapOptions([{
          registration_option: access.registrationOption,
          academic_year: access.academicYear,
          year_group: access.yearGroup || "Year group",
          course_title: access.courseTitle,
          group_code: access.groupCode,
          group_name: access.groupName
        }]);
      }
      return Object.freeze([]);
    }
    return mapOptions(await api.getRegistrationOptions());
  }

  async function complete(details, registrationKey) {
    requireSession();
    const checked = validateProfile(details);
    const key = clean(registrationKey);
    if (!checked.ok) throw new PlatformError({ code: checked.code, category: "validation" });
    if (!key) throw new PlatformError({ code: "INVALID_REGISTRATION_OPTION", category: "validation" });
    try {
      const result = await api.completeOnboarding({
        p_first_name: checked.value.firstName,
        p_surname: checked.value.surname,
        p_student_number: checked.value.studentNumber,
        p_registration_option: key
      });
      clearPending();
      await learnerContext?.refresh?.();
      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      throw mapPlatformError(error, { operation: "complete-onboarding" });
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
    pendingKey
  });
}
