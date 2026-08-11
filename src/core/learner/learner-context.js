import { mapPlatformError } from "../errors/platform-error.js";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normaliseProfile(profile) {
  if (!profile) return null;
  const firstName = clean(profile.first_name ?? profile.firstName);
  const surname = clean(profile.surname);
  const displayName = clean(profile.display_name ?? profile.displayName) || `${firstName} ${surname}`.trim();
  return Object.freeze({
    studentNumber: clean(profile.student_number ?? profile.studentNumber),
    firstName,
    surname,
    fullName: `${firstName} ${surname}`.trim() || displayName,
    displayName,
    contactEmail: clean(profile.contact_email ?? profile.contactEmail)
  });
}

function normaliseEnrolments(rows) {
  return Object.freeze((Array.isArray(rows) ? rows : []).map((row) => Object.freeze({
    status: clean(row.status),
    groupCode: clean(row.group_code ?? row.groupCode),
    groupName: clean(row.group_name ?? row.groupName),
    yearGroup: clean(row.year_group ?? row.yearGroup),
    academicYear: clean(row.academic_year ?? row.academicYear),
    courseTitle: clean(row.course_title ?? row.courseTitle),
    joinedOn: row.joined_on ?? row.joinedOn ?? null
  })));
}

export function createLearnerContext({ authService, profileService, enrolmentService } = {}) {
  let state = Object.freeze({ status: "loading", context: null, error: null });
  let refreshPromise = null;
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

  async function refresh() {
    if (!authService.isSignedIn()) return publish({ status: "signed-out", context: null, error: null });
    if (refreshPromise) return refreshPromise;
    publish({ status: "loading", error: null });
    refreshPromise = Promise.all([profileService.getProfile(), enrolmentService.getEnrolments()])
      .then(([rawProfile, rawEnrolments]) => {
        const profile = normaliseProfile(rawProfile);
        const enrolments = normaliseEnrolments(rawEnrolments);
        if (!profile) return publish({ status: "onboarding-required", context: null, error: null });
        const active = enrolments.find((item) => item.status === "active") || enrolments[0] || null;
        const context = Object.freeze({
          ...profile,
          yearGroup: active?.yearGroup || "",
          academicYear: active?.academicYear || "",
          groupCode: active?.groupCode || "",
          groupName: active?.groupName || "",
          enrolments
        });
        return publish({ status: "authenticated", context, error: null });
      })
      .catch((error) => {
        const mapped = mapPlatformError(error, { operation: "load-learner-context" });
        publish({ status: "error", error: mapped });
        throw mapped;
      })
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  authService.subscribe((authState) => {
    if (authState.status === "authenticated") refresh().catch(() => {});
    if (authState.status === "signed-out") publish({ status: "signed-out", context: null, error: null });
  });

  return Object.freeze({
    initialise: async () => { await authService.initialise(); return refresh(); },
    refresh,
    subscribe,
    getState: () => state,
    getContext: () => state.context
  });
}
