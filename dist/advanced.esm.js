// src/core/errors/platform-error.js
var ERROR_CATEGORIES = Object.freeze([
  "authentication",
  "authorisation",
  "validation",
  "network",
  "submission",
  "configuration",
  "platform",
  "unexpected"
]);
var DEFAULT_MESSAGES = Object.freeze({
  authentication: "Sign in to continue.",
  authorisation: "Your account does not have access to this action.",
  validation: "Check the information you entered and try again.",
  network: "The learner service could not be reached. Check your connection and try again.",
  submission: "Your work could not be submitted. It remains available for you to retry.",
  configuration: "This learning hub is not configured correctly. Contact your tutor.",
  platform: "The learner service could not complete that request. Try again shortly.",
  unexpected: "Something went wrong. Try again or contact your tutor."
});
var CODE_RULES = Object.freeze([
  [/AUTH|CREDENTIAL|SESSION|EMAIL_NOT_CONFIRMED/i, "authentication"],
  [/PERMISSION|FORBIDDEN|RLS|42501/i, "authorisation"],
  [/INVALID|VALIDATION|REQUIRED|MISMATCH/i, "validation"],
  [/NETWORK|FETCH|TIMEOUT|ABORT|OFFLINE/i, "network"],
  [/SUBMIT|ATTEMPT|ASSIGNMENT|ACTIVITY_VERSION/i, "submission"],
  [/CONFIG|SUPABASE_URL|PUBLISHABLE_KEY/i, "configuration"]
]);
var PlatformError = class extends Error {
  constructor({
    code = "UNEXPECTED_ERROR",
    category = "unexpected",
    learnerMessage,
    diagnostic = {},
    cause
  } = {}) {
    const safeCategory = ERROR_CATEGORIES.includes(category) ? category : "unexpected";
    super(learnerMessage || DEFAULT_MESSAGES[safeCategory], cause ? { cause } : void 0);
    this.name = "PlatformError";
    this.code = String(code || "UNEXPECTED_ERROR");
    this.category = safeCategory;
    this.learnerMessage = learnerMessage || DEFAULT_MESSAGES[safeCategory];
    this.diagnostic = Object.freeze({ ...diagnostic });
  }
  toJSON() {
    return {
      code: this.code,
      category: this.category,
      learnerMessage: this.learnerMessage
    };
  }
};
function categoryFor(code, error) {
  if (error?.status === 401) return "authentication";
  if (error?.status === 403) return "authorisation";
  if (error?.status === 0) return "network";
  const match = CODE_RULES.find(([pattern]) => pattern.test(code));
  return match ? match[1] : "platform";
}
function mapPlatformError(error, overrides = {}) {
  if (error instanceof PlatformError && Object.keys(overrides).length === 0) return error;
  const sourceCode = String(overrides.code || error?.code || error?.name || "PLATFORM_ERROR");
  const category = overrides.category || categoryFor(sourceCode, error);
  return new PlatformError({
    code: sourceCode,
    category,
    learnerMessage: overrides.learnerMessage || DEFAULT_MESSAGES[category],
    diagnostic: {
      operation: overrides.operation || null,
      status: Number.isFinite(error?.status) ? error.status : null,
      sourceCode
    },
    cause: error
  });
}

// src/core/config/platform-config.js
var NAVIGATION_MODES = Object.freeze(["standard", "as-supplied"]);
var STANDARD_NAVIGATION = Object.freeze([
  Object.freeze({ id: "home", label: "Home" }),
  Object.freeze({ id: "learning", label: "Learning" }),
  Object.freeze({ id: "activities", label: "Activities" }),
  Object.freeze({ id: "resources", label: "Resources" }),
  Object.freeze({ id: "progress", label: "Progress" }),
  Object.freeze({ id: "account", label: "Account" })
]);
var HUB_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var HEX_COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;
function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function navigationItem(item2, defaults = {}) {
  const id = cleanString(item2?.id) || defaults.id;
  const label = cleanString(item2?.label) || defaults.label;
  const path = cleanString(item2?.path);
  if (!id || !label) {
    throw new PlatformError({ code: "INVALID_NAVIGATION_ITEM", category: "configuration" });
  }
  return Object.freeze({
    id,
    label,
    path,
    enabled: item2.enabled !== false && Boolean(path)
  });
}
function navigationFrom(items = [], mode = "standard") {
  if (!Array.isArray(items)) {
    throw new PlatformError({ code: "INVALID_NAVIGATION", category: "configuration" });
  }
  if (mode === "as-supplied") {
    if (!items.length) {
      throw new PlatformError({ code: "INVALID_NAVIGATION", category: "configuration" });
    }
    return Object.freeze(items.map((item2) => {
      const parsed = navigationItem(item2);
      if (!parsed.path) {
        throw new PlatformError({ code: "INVALID_NAVIGATION_ITEM", category: "configuration" });
      }
      return parsed;
    }));
  }
  const supplied = new Map(items.map((item2) => [cleanString(item2?.id), item2]));
  const standard = STANDARD_NAVIGATION.map((definition) => {
    const item2 = supplied.get(definition.id) || {};
    supplied.delete(definition.id);
    return navigationItem({ ...definition, ...item2, id: definition.id, label: cleanString(item2.label) || definition.label }, definition);
  });
  const additions = Array.from(supplied.values()).map((item2) => {
    const parsed = navigationItem(item2);
    if (!parsed.path) {
      throw new PlatformError({ code: "INVALID_NAVIGATION_ITEM", category: "configuration" });
    }
    return parsed;
  });
  return Object.freeze([...standard, ...additions]);
}
function navigationModeFrom(value) {
  const mode = cleanString(value) || "standard";
  if (!NAVIGATION_MODES.includes(mode)) {
    throw new PlatformError({ code: "INVALID_NAVIGATION_MODE", category: "configuration" });
  }
  return mode;
}
function safeBrandColour(value, fallback) {
  const colour = cleanString(value);
  if (!colour) return fallback;
  if (!HEX_COLOUR_PATTERN.test(colour)) {
    throw new PlatformError({ code: "INVALID_THEME_COLOUR", category: "configuration" });
  }
  return colour;
}
function createPlatformConfig(options = {}) {
  const hubCode = cleanString(options.hubCode);
  const hubName = cleanString(options.hubName);
  if (!HUB_CODE_PATTERN.test(hubCode)) {
    throw new PlatformError({ code: "INVALID_HUB_CODE", category: "configuration" });
  }
  if (!hubName) {
    throw new PlatformError({ code: "INVALID_HUB_NAME", category: "configuration" });
  }
  if (options.apiSchema && options.apiSchema !== "api") {
    throw new PlatformError({ code: "PRIVATE_SCHEMA_PROHIBITED", category: "configuration" });
  }
  const navigationMode = navigationModeFrom(options.navigationMode);
  return Object.freeze({
    hubCode,
    hubName,
    platformVersion: cleanString(options.platformVersion) || "0.1",
    apiSchema: "api",
    accountPath: cleanString(options.accountPath) || "./account/",
    navigationMode,
    navigation: navigationFrom(options.navigation, navigationMode),
    features: Object.freeze({ ...options.features || {} }),
    theme: Object.freeze({
      primary: safeBrandColour(options.theme?.primary, "#315b7d"),
      accent: safeBrandColour(options.theme?.accent, "#4f7695")
    }),
    courseKey: cleanString(options.courseKey),
    supabase: Object.freeze({
      projectUrl: cleanString(options.supabase?.projectUrl),
      publishableKey: cleanString(options.supabase?.publishableKey)
    })
  });
}

// src/core/api/supabase-client.js
var PROJECT_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
function createSupabaseClient(config = {}, dependencies = {}) {
  if (dependencies.client) return dependencies.client;
  const projectUrl = typeof config.projectUrl === "string" ? config.projectUrl.trim().replace(/\/+$/, "") : "";
  const publishableKey = typeof config.publishableKey === "string" ? config.publishableKey.trim() : "";
  if (!PROJECT_URL.test(projectUrl) || !publishableKey) {
    throw new PlatformError({ code: "INVALID_SUPABASE_CONFIGURATION", category: "configuration" });
  }
  const createClient = dependencies.createClient || globalThis.supabase?.createClient;
  if (typeof createClient !== "function") {
    throw new PlatformError({ code: "SUPABASE_SDK_UNAVAILABLE", category: "configuration" });
  }
  return createClient(projectUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

// src/core/api/learner-api.js
function unwrap(result, operation) {
  if (result?.error) throw mapPlatformError(result.error, { operation });
  return result?.data ?? null;
}
function requireApiSchema(schema) {
  if (schema !== "api") {
    throw new PlatformError({ code: "PRIVATE_SCHEMA_PROHIBITED", category: "configuration" });
  }
}
function createLearnerApi({ client, schema = "api", logger } = {}) {
  requireApiSchema(schema);
  if (!client || typeof client.schema !== "function") {
    throw new PlatformError({ code: "SUPABASE_CLIENT_REQUIRED", category: "configuration" });
  }
  const api = client.schema(schema);
  async function read(view, { select = "*", order, ascending = true, filters = [] } = {}) {
    try {
      let query = api.from(view).select(select);
      filters.forEach(({ column, value }) => {
        if (value !== void 0 && value !== null && value !== "") query = query.eq(column, value);
      });
      if (order) query = query.order(order, { ascending });
      return unwrap(await query, `read:${view}`) || [];
    } catch (error) {
      logger?.warn("api.read.failed", { view, code: error?.code });
      throw mapPlatformError(error, { operation: `read:${view}` });
    }
  }
  async function rpc(name, payload = {}) {
    try {
      return unwrap(await api.rpc(name, payload), `rpc:${name}`);
    } catch (error) {
      logger?.warn("api.rpc.failed", { rpc: name, code: error?.code });
      throw mapPlatformError(error, { operation: `rpc:${name}` });
    }
  }
  return Object.freeze({
    getProfile: async () => (await read("my_profile", { select: "*" }))[0] || null,
    getEnrolments: () => read("my_enrolments", { order: "joined_on" }),
    getAssignments: () => read("my_assignments", { order: "activity_key" }),
    getCurriculumDelivery: () => read("my_activity_delivery", { order: "sort_order" }),
    getAttempts: (activityKey) => read("my_attempts", {
      order: "received_at",
      ascending: false,
      filters: [{ column: "activity_key", value: activityKey }]
    }),
    getResponses: (activityKey) => read("my_responses", {
      order: "received_at",
      ascending: false,
      filters: [{ column: "activity_key", value: activityKey }]
    }),
    getProgress: (activityKey) => read("my_activity_progress", {
      filters: [{ column: "activity_key", value: activityKey }]
    }),
    getRegistrationOptions: () => rpc("registration_options"),
    completeOnboarding: (payload) => rpc("complete_learner_onboarding", payload),
    submitAttempt: (payload) => rpc("submit_attempt", payload),
    markFormativeResponse: (payload) => rpc("mark_formative_response", payload),
    getPublishedCurriculum: () => rpc("published_curriculum"),
    getPublishedCurriculumPackage: (hubCode, courseKey, packageVersion) => rpc("published_curriculum_package", {
      p_hub_code: hubCode,
      p_course_key: courseKey,
      ...packageVersion ? { p_package_version: packageVersion } : {}
    })
  });
}

// src/core/auth/auth-service.js
function createAuthService({ client, logger } = {}) {
  if (!client?.auth) {
    throw new PlatformError({ code: "SUPABASE_AUTH_REQUIRED", category: "configuration" });
  }
  let state = Object.freeze({ status: "loading", session: null, error: null });
  let initialised = false;
  let initialisePromise = null;
  const listeners = /* @__PURE__ */ new Set();
  function publish(next) {
    state = Object.freeze({ ...state, ...next });
    listeners.forEach((listener) => listener(state));
    return state;
  }
  function subscribe(listener) {
    if (typeof listener !== "function") return () => {
    };
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
    initialisePromise = client.auth.getSession().then((result) => {
      if (result.error) throw result.error;
      const session = result.data?.session || null;
      return publish({ status: session ? "authenticated" : "signed-out", session, error: null });
    }).catch((error) => {
      const mapped = mapPlatformError(error, { operation: "restore-session" });
      publish({ status: "error", session: null, error: mapped });
      throw mapped;
    }).finally(() => {
      initialisePromise = null;
    });
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

// src/core/session/session-service.js
function createSessionService(authService) {
  return Object.freeze({
    restore: () => authService.initialise(),
    subscribe: (listener) => authService.subscribe(listener),
    getSession: () => authService.getSession(),
    hasActiveSession: () => authService.isSignedIn(),
    signOut: () => authService.signOut()
  });
}

// src/core/learner/learner-context.js
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
function createLearnerContext({ authService, profileService, enrolmentService } = {}) {
  let state = Object.freeze({ status: "loading", context: null, error: null });
  let refreshPromise = null;
  const listeners = /* @__PURE__ */ new Set();
  function publish(next) {
    state = Object.freeze({ ...state, ...next });
    listeners.forEach((listener) => listener(state));
    return state;
  }
  function subscribe(listener) {
    if (typeof listener !== "function") return () => {
    };
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }
  async function refresh() {
    if (!authService.isSignedIn()) return publish({ status: "signed-out", context: null, error: null });
    if (refreshPromise) return refreshPromise;
    publish({ status: "loading", error: null });
    refreshPromise = Promise.all([profileService.getProfile(), enrolmentService.getEnrolments()]).then(([rawProfile, rawEnrolments]) => {
      const profile = normaliseProfile(rawProfile);
      const enrolments = normaliseEnrolments(rawEnrolments);
      if (!profile) return publish({ status: "onboarding-required", context: null, error: null });
      const active = enrolments.find((item2) => item2.status === "active") || enrolments[0] || null;
      const context = Object.freeze({
        ...profile,
        yearGroup: active?.yearGroup || "",
        academicYear: active?.academicYear || "",
        groupCode: active?.groupCode || "",
        groupName: active?.groupName || "",
        enrolments
      });
      return publish({ status: "authenticated", context, error: null });
    }).catch((error) => {
      const mapped = mapPlatformError(error, { operation: "load-learner-context" });
      publish({ status: "error", error: mapped });
      throw mapped;
    }).finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }
  authService.subscribe((authState) => {
    if (authState.status === "authenticated") refresh().catch(() => {
    });
    if (authState.status === "signed-out") publish({ status: "signed-out", context: null, error: null });
  });
  return Object.freeze({
    initialise: async () => {
      await authService.initialise();
      return refresh();
    },
    refresh,
    subscribe,
    getState: () => state,
    getContext: () => state.context
  });
}

// src/core/onboarding/onboarding-service.js
var SAFE_PENDING_FIELDS = Object.freeze(["firstName", "surname", "studentNumber", "registrationKey"]);
function clean2(value) {
  return typeof value === "string" ? value.trim() : "";
}
function validateProfile(details = {}) {
  const value = {
    firstName: clean2(details.firstName),
    surname: clean2(details.surname),
    studentNumber: clean2(details.studentNumber)
  };
  if (!value.firstName || value.firstName.length > 100) return { ok: false, code: "INVALID_FIRST_NAME" };
  if (!value.surname || value.surname.length > 100) return { ok: false, code: "INVALID_SURNAME" };
  if (!value.studentNumber || value.studentNumber.length > 100) return { ok: false, code: "INVALID_STUDENT_NUMBER" };
  return { ok: true, value };
}
function validateAccount(details = {}) {
  const email = clean2(details.email);
  const password = typeof details.password === "string" ? details.password : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, code: "INVALID_EMAIL" };
  if (password.length < 8) return { ok: false, code: "WEAK_PASSWORD" };
  return { ok: true, value: { email, password } };
}
function createOnboardingService({ api, authService, learnerContext, storage = globalThis.sessionStorage, pendingKey = "learning-platform.pending-onboarding.v1" } = {}) {
  function safePending(details = {}) {
    const checked = validateProfile(details);
    if (!checked.ok) throw new PlatformError({ code: checked.code, category: "validation" });
    const pending = { ...checked.value };
    if (clean2(details.registrationKey)) pending.registrationKey = clean2(details.registrationKey);
    return Object.freeze(pending);
  }
  function savePending(details) {
    const pending = safePending(details);
    try {
      storage?.setItem(pendingKey, JSON.stringify(pending));
    } catch {
    }
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
    try {
      storage?.removeItem(pendingKey);
    } catch {
    }
  }
  function requireSession() {
    if (!authService.isSignedIn()) {
      throw new PlatformError({ code: "AUTH_REQUIRED", category: "authentication" });
    }
  }
  async function getRegistrationOptions() {
    requireSession();
    const rows = await api.getRegistrationOptions();
    return Object.freeze((Array.isArray(rows) ? rows : []).map((row) => Object.freeze({
      registrationKey: clean2(row.registration_option ?? row.registrationKey),
      academicYear: clean2(row.academic_year ?? row.academicYear),
      yearGroup: clean2(row.year_group ?? row.yearGroup),
      courseTitle: clean2(row.course_title ?? row.courseTitle),
      groupCode: clean2(row.group_code ?? row.groupCode),
      groupName: clean2(row.group_name ?? row.groupName)
    })).filter((option) => option.registrationKey && option.yearGroup));
  }
  async function complete(details, registrationKey) {
    requireSession();
    const checked = validateProfile(details);
    const key = clean2(registrationKey);
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
    savePending,
    getPending,
    clearPending,
    getRegistrationOptions,
    complete,
    pendingKey
  });
}

// src/core/profile/profile-service.js
function createProfileService(api) {
  return Object.freeze({ getProfile: () => api.getProfile() });
}

// src/core/enrolment/enrolment-service.js
function createEnrolmentService(api) {
  return Object.freeze({ getEnrolments: () => api.getEnrolments() });
}

// src/core/assignment/assignment-service.js
function createAssignmentService(api) {
  return Object.freeze({
    getAssignments: () => api.getAssignments(),
    getCurriculumDelivery: () => api.getCurriculumDelivery()
  });
}

// src/core/progress/progress-service.js
function createProgressService(api) {
  return Object.freeze({
    getProgress: (activityKey) => api.getProgress(activityKey),
    getAttempts: (activityKey) => api.getAttempts(activityKey),
    getResponses: (activityKey) => api.getResponses(activityKey)
  });
}

// src/core/security/hub-security-baseline.js
var HUB_SECURITY_CONTROLS = Object.freeze([
  "HSB-01",
  "HSB-02",
  "HSB-03",
  "HSB-04",
  "HSB-05",
  "HSB-06",
  "HSB-07",
  "HSB-08",
  "HSB-09",
  "HSB-10",
  "HSB-11",
  "HSB-12",
  "HSB-13",
  "HSB-14",
  "HSB-15"
]);
var FORBIDDEN_IDENTITY_FIELD = /^(learner_id|learnerId|student_id|studentId|enrolment_id|enrolmentId|group_id|groupId)$/i;
var FORBIDDEN_MARK_FIELD = /^(awarded_score|awardedScore|is_correct|isCorrect|marking_source|markingSource)$/i;
var FORBIDDEN_SUBMISSION_FIELD = /^(learner|learnerId|learner_id|student|studentId|student_id|studentNumber|student_number|firstName|first_name|surname|email|enrolment|enrolmentId|enrolment_id|assignment|assignmentId|assignment_id|attemptNumber|attempt_number|score|totalScore|total_score|maxScore|max_score|awarded_score|awardedScore|is_correct|isCorrect|marking_source|markingSource|groupId|group_id)$/i;
var ALLOWED_SUBMISSION_FIELDS = Object.freeze([
  "activityKey",
  "activityVersion",
  "clientAttemptId",
  "responses",
  "sourcePage",
  "startedAt",
  "completedAt",
  "programmingLanguage"
]);
var APPROVED_BROWSER_STORAGE = Object.freeze([
  "draft responses",
  "UI state",
  "cached server progress",
  "unsent retry payloads",
  "idempotent client attempt IDs"
]);
var AUTHORITATIVE_STORAGE_FORBIDDEN = Object.freeze([
  "final score",
  "correctness",
  "learner identity",
  "enrolment",
  "official completion",
  "official progress"
]);
function canonicalActivityVersion(value) {
  const clean3 = typeof value === "string" ? value.trim() : "";
  if (!clean3) return "";
  if (/^\d+\.\d+$/.test(clean3)) return `${clean3}.0`;
  return clean3;
}
function resolveActivityVersion(activity) {
  if (!activity || typeof activity !== "object") return "";
  const raw = typeof activity.version === "string" ? activity.version : typeof activity.activityVersion === "string" ? activity.activityVersion : "";
  const canonical = canonicalActivityVersion(raw);
  if (!canonical) return "";
  if (/^latest$/i.test(canonical)) return "";
  if (!/^\d+\.\d+\.\d+/.test(canonical)) return "";
  return canonical;
}

// src/core/evidence/evidence.js
var EVIDENCE_TYPES = Object.freeze([
  "single-choice",
  "multi-select",
  "matching",
  "ordering",
  "written",
  "reflection",
  "coding",
  "classification"
]);
function questionKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) throw new PlatformError({ code: "QUESTION_KEY_REQUIRED", category: "validation" });
  return key;
}
function item(key, type, value) {
  return Object.freeze({ questionKey: questionKey(key), evidenceType: type, value });
}
function stringList(value, code) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new PlatformError({ code, category: "validation" });
  }
  return Object.freeze(value.map((entry) => entry.trim()));
}
function singleChoice(key, optionId) {
  const selected = typeof optionId === "string" ? optionId.trim() : "";
  if (!selected) throw new PlatformError({ code: "OPTION_REQUIRED", category: "validation" });
  return item(key, "single-choice", Object.freeze({ optionId: selected }));
}
function multiSelect(key, optionIds) {
  return item(key, "multi-select", Object.freeze({ optionIds: stringList(optionIds, "OPTIONS_REQUIRED") }));
}
function matching(key, pairs) {
  if (!Array.isArray(pairs) || pairs.some((pair) => !pair || typeof pair.left !== "string" || typeof pair.right !== "string")) {
    throw new PlatformError({ code: "MATCHING_PAIRS_REQUIRED", category: "validation" });
  }
  return item(key, "matching", Object.freeze({
    pairs: Object.freeze(pairs.map((pair) => Object.freeze({ left: pair.left.trim(), right: pair.right.trim() })))
  }));
}
function ordering(key, itemIds) {
  return item(key, "ordering", Object.freeze({ itemIds: stringList(itemIds, "ORDER_REQUIRED") }));
}
function written(key, text) {
  return item(key, "written", Object.freeze({ text: String(text ?? "") }));
}
function reflection(key, text) {
  return item(key, "reflection", Object.freeze({ text: String(text ?? "") }));
}
function coding(key, sourceCode, { language = null, output = null } = {}) {
  return item(key, "coding", Object.freeze({
    sourceCode: String(sourceCode ?? ""),
    language: typeof language === "string" && language.trim() ? language.trim() : null,
    output: typeof output === "string" ? output : null
  }));
}
function classification(key, categoryId, itemId = null) {
  const category = typeof categoryId === "string" ? categoryId.trim() : "";
  if (!category) throw new PlatformError({ code: "CATEGORY_REQUIRED", category: "validation" });
  return item(key, "classification", Object.freeze({
    categoryId: category,
    itemId: typeof itemId === "string" && itemId.trim() ? itemId.trim() : null
  }));
}
function toApiResponse(evidence2) {
  if (!evidence2 || !EVIDENCE_TYPES.includes(evidence2.evidenceType)) {
    throw new PlatformError({ code: "INVALID_EVIDENCE", category: "validation" });
  }
  assertNoIdentityFields(evidence2.value);
  return Object.freeze({
    question_id: questionKey(evidence2.questionKey),
    response_type: evidence2.evidenceType,
    response_payload: stripClientMarks(evidence2.value)
  });
}
function assertNoIdentityFields(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoIdentityFields);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_IDENTITY_FIELD.test(key)) {
        throw new PlatformError({
          code: "FORBIDDEN_SUBMISSION_FIELD",
          category: "submission",
          diagnostic: { field: key }
        });
      }
      assertNoIdentityFields(nested);
    }
  }
}
function stripClientMarks(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(stripClientMarks));
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_MARK_FIELD.test(key)) continue;
      next[key] = stripClientMarks(nested);
    }
    return Object.freeze(next);
  }
  return value;
}
var evidence = Object.freeze({
  singleChoice,
  multiSelect,
  matching,
  ordering,
  written,
  reflection,
  coding,
  classification,
  toApiResponse
});

// src/core/submission/submission-service.js
var ALLOWED_FIELDS = ALLOWED_SUBMISSION_FIELDS;
function requiredString(value, code) {
  const clean3 = typeof value === "string" ? value.trim() : "";
  if (!clean3) throw new PlatformError({ code, category: "validation" });
  return clean3;
}
function timestamp(value, code) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new PlatformError({ code, category: "validation" });
  return date.toISOString();
}
function sourcePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  try {
    return new URL(raw, "https://hub.invalid").pathname;
  } catch {
    return raw.split(/[?#]/, 1)[0] || null;
  }
}
function storageKey(activityKey) {
  return `learning-platform.attempt.v1:${encodeURIComponent(activityKey)}`;
}
function generateUuid(runtimeCrypto) {
  if (typeof runtimeCrypto?.randomUUID === "function") return runtimeCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  runtimeCrypto?.getRandomValues?.(bytes);
  if (bytes.every((value) => value === 0)) {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function assertSecureSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlatformError({ code: "INVALID_SUBMISSION", category: "validation" });
  }
  Object.keys(input).forEach((key) => {
    if (FORBIDDEN_SUBMISSION_FIELD.test(key)) {
      throw new PlatformError({ code: "FORBIDDEN_SUBMISSION_FIELD", category: "submission", diagnostic: { field: key } });
    }
    if (!ALLOWED_FIELDS.includes(key)) {
      throw new PlatformError({ code: "UNRECOGNISED_SUBMISSION_FIELD", category: "submission", diagnostic: { field: key } });
    }
  });
  return true;
}
function createSubmissionService({
  api,
  auth = null,
  storage = globalThis.sessionStorage,
  crypto = globalThis.crypto
} = {}) {
  function requireSignedIn() {
    if (!auth || typeof auth.isSignedIn !== "function") return;
    if (auth.isSignedIn() !== true) {
      throw new PlatformError({ code: "AUTH_REQUIRED", category: "authentication" });
    }
  }
  function getAttemptId(activityKey) {
    const key = storageKey(requiredString(activityKey, "ACTIVITY_KEY_REQUIRED"));
    try {
      const stored = storage?.getItem(key);
      if (typeof stored === "string" && stored.trim()) return stored.trim();
    } catch {
    }
    const attemptId = generateUuid(crypto);
    try {
      storage?.setItem(key, attemptId);
    } catch {
    }
    return attemptId;
  }
  function beginAttempt(activityKey) {
    const key = storageKey(requiredString(activityKey, "ACTIVITY_KEY_REQUIRED"));
    try {
      storage?.removeItem(key);
    } catch {
    }
    return getAttemptId(activityKey);
  }
  function buildPayload(input) {
    assertSecureSubmission(input);
    const activityKey = requiredString(input.activityKey, "ACTIVITY_KEY_REQUIRED");
    const activityVersion = requiredString(
      canonicalActivityVersion(input.activityVersion),
      "ACTIVITY_VERSION_REQUIRED"
    );
    if (!Array.isArray(input.responses) || input.responses.length === 0) {
      throw new PlatformError({ code: "RESPONSES_REQUIRED", category: "validation" });
    }
    return Object.freeze({
      p_activity_key: activityKey,
      p_activity_version: activityVersion,
      p_client_attempt_id: input.clientAttemptId ? requiredString(input.clientAttemptId, "CLIENT_ATTEMPT_ID_REQUIRED") : getAttemptId(activityKey),
      p_responses: Object.freeze(input.responses.map(toApiResponse)),
      p_source_page: sourcePath(input.sourcePage),
      p_started_at: timestamp(input.startedAt, "INVALID_STARTED_TIMESTAMP"),
      p_completed_at: timestamp(input.completedAt, "INVALID_COMPLETED_TIMESTAMP"),
      p_programming_language: typeof input.programmingLanguage === "string" && input.programmingLanguage.trim() ? input.programmingLanguage.trim() : null
    });
  }
  async function submit(input) {
    requireSignedIn();
    const payload = buildPayload(input);
    try {
      const result = await api.submitAttempt(payload);
      const key = storageKey(payload.p_activity_key);
      try {
        if (storage?.getItem(key) === payload.p_client_attempt_id) storage.removeItem(key);
      } catch {
      }
      return result;
    } catch (error) {
      throw mapPlatformError(error, { operation: "submit-attempt", category: "submission" });
    }
  }
  return Object.freeze({
    buildPayload,
    submit,
    getAttemptId,
    beginAttempt,
    allowedFields: ALLOWED_FIELDS
  });
}

// src/core/marking/formative-marking-service.js
var CHECK_FAILED_MESSAGE = "Your answer could not be checked. Please try again.";
var RETRY_LIMIT_MESSAGE = "You have used all allowed checks for this question.";
var ALLOWED_MARK_INPUT = /* @__PURE__ */ new Set([
  "activityKey",
  "activityVersion",
  "block",
  "responses",
  "clientCheckId",
  "sourcePage"
]);
function generateCheckId(runtimeCrypto) {
  if (typeof runtimeCrypto?.randomUUID === "function") return runtimeCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  runtimeCrypto?.getRandomValues?.(bytes);
  if (bytes.every((value) => value === 0)) {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function sourcePath2(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  try {
    return new URL(raw, "https://hub.invalid").pathname;
  } catch {
    return raw.split(/[?#]/, 1)[0] || null;
  }
}
function assertAllowedMarkInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlatformError({ code: "INVALID_SUBMISSION", category: "validation" });
  }
  Object.keys(input).forEach((key) => {
    if (!ALLOWED_MARK_INPUT.has(key)) {
      throw new PlatformError({
        code: "FORBIDDEN_SUBMISSION_FIELD",
        category: "submission",
        diagnostic: { field: key }
      });
    }
  });
}
function requiredString2(value, code) {
  const clean3 = typeof value === "string" ? value.trim() : "";
  if (!clean3) throw new PlatformError({ code, category: "validation" });
  return clean3;
}
function questionIdFor(block) {
  return String(block?.content?.questionId || block?.id || "").trim();
}
function blockType(block) {
  return String(block?.type || "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
var MARKING_FIELD = /^(correctOptionId|correctCategoryId|correctValues|answerKey|markScheme|modelAnswer|correctOptions|correctOrder|spec)$/;
function learnerSafeValue(value) {
  if (Array.isArray(value)) return value.map(learnerSafeValue);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, nested] of Object.entries(value)) {
    if (MARKING_FIELD.test(key)) continue;
    if (key === "correct" && nested && typeof nested === "object") continue;
    next[key] = learnerSafeValue(nested);
  }
  return next;
}
function assertNoForbiddenInput(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenInput);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_SUBMISSION_FIELD.test(key)) {
      throw new PlatformError({
        code: "FORBIDDEN_SUBMISSION_FIELD",
        category: "submission",
        diagnostic: { field: key }
      });
    }
    assertNoForbiddenInput(nested);
  }
}
function evidenceItems(block, responses) {
  const type = blockType(block);
  const questionId = questionIdFor(block);
  if (!questionId) {
    throw new PlatformError({ code: "QUESTION_KEY_REQUIRED", category: "validation" });
  }
  if (type === "single-choice" || type === "option-cards") {
    const optionId = typeof responses === "string" ? responses : asObject(responses).optionId;
    return [evidence.singleChoice(questionId, optionId)];
  }
  if (type === "classification") {
    const assignments = asObject(responses);
    const items = Array.isArray(block?.content?.items) ? block.content.items : [];
    if (!items.length) {
      throw new PlatformError({ code: "RESPONSES_REQUIRED", category: "validation" });
    }
    return items.map((item2) => {
      const itemId = String(item2?.id || "").trim();
      if (!itemId) {
        throw new PlatformError({ code: "QUESTION_KEY_REQUIRED", category: "validation" });
      }
      return evidence.classification(`${questionId}:${itemId}`, assignments[itemId], itemId);
    });
  }
  if (type === "short-response") {
    const text = typeof responses === "string" ? responses : asObject(responses).text;
    return [evidence.written(questionId, text)];
  }
  if (type === "reflection") {
    const text = typeof responses === "string" ? responses : asObject(responses).text;
    return [evidence.reflection(questionId, text)];
  }
  if (type === "drag-drop") {
    const placements = asObject(responses);
    const items = Array.isArray(block?.content?.items) ? block.content.items : [];
    return [evidence.matching(
      questionId,
      items.map((item2) => ({
        left: String(item2?.id || "").trim(),
        right: String(placements[item2?.id] || "").trim()
      }))
    )];
  }
  if (type === "ordering" || type === "sequence") {
    const itemIds = Array.isArray(asObject(responses).itemIds) ? asObject(responses).itemIds : [];
    return [evidence.ordering(questionId, itemIds)];
  }
  if (type === "fill-gap" || type === "phrase-completion") {
    const placements = asObject(responses);
    const gaps = Array.isArray(block?.content?.gaps) && block.content.gaps.length ? block.content.gaps : [{ id: "gap" }];
    return gaps.map((gap) => {
      const gapId = String(gap?.id || "").trim() || "gap";
      return evidence.singleChoice(`${questionId}:${gapId}`, placements[gapId]);
    });
  }
  throw new PlatformError({ code: "UNSUPPORTED_BLOCK_TYPE", category: "validation" });
}
function numeric(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}
function mapRow(row) {
  const correctValue = row?.is_correct;
  const review = Boolean(row?.requires_review);
  const maxScore = numeric(row?.max_score);
  const awardedScore = numeric(row?.awarded_score);
  const correct = correctValue === true ? true : correctValue === false ? false : null;
  const scored = !review && correct !== null && maxScore > 0;
  const remaining = row?.remaining_attempts == null ? null : numeric(row.remaining_attempts);
  return Object.freeze({
    questionId: String(row?.question_id || ""),
    awardedScore,
    maxScore,
    correct,
    requiresReview: review,
    markingSource: "server",
    checkNumber: numeric(row?.check_number) || void 0,
    remainingAttempts: remaining,
    canRetry: row?.can_retry === false ? false : row?.can_retry === true ? true : void 0,
    score: scored ? Object.freeze({ correct: awardedScore, total: maxScore }) : void 0
  });
}
function itemIdFromQuestion(questionId, prefix) {
  if (!prefix || !questionId.startsWith(`${prefix}:`)) return void 0;
  return questionId.slice(prefix.length + 1);
}
function aggregateRows(rows, block) {
  const mapped = rows.map(mapRow);
  const requiresReview = mapped.some((item2) => item2.requiresReview);
  const scored = mapped.filter((item2) => item2.score);
  const allCorrect = mapped.length > 0 && mapped.every((item2) => item2.correct === true);
  const anyIncorrect = mapped.some((item2) => item2.correct === false);
  const correct = requiresReview ? null : allCorrect ? true : anyIncorrect ? false : null;
  const score = scored.length ? Object.freeze({
    correct: scored.reduce((total, item2) => total + item2.score.correct, 0),
    total: scored.reduce((total, item2) => total + item2.score.total, 0)
  }) : void 0;
  const status = requiresReview ? "review" : correct === true ? "correct" : correct === false ? "incorrect" : "recorded";
  const prefix = questionIdFor(block);
  const remainingValues = mapped.map((item2) => item2.remainingAttempts).filter((value) => value != null);
  const remainingAttempts = mapped.some((item2) => item2.remainingAttempts == null) ? null : remainingValues.length ? Math.min(...remainingValues) : void 0;
  return Object.freeze({
    completed: true,
    correct,
    requiresReview,
    score,
    status,
    remainingAttempts,
    canRetry: mapped.length > 0 && mapped.every((item2) => item2.canRetry !== false),
    checkNumber: mapped.reduce((highest, item2) => Math.max(highest, item2.checkNumber || 0), 0) || void 0,
    itemResults: Object.freeze(mapped.map((item2) => Object.freeze({
      questionId: item2.questionId,
      itemId: itemIdFromQuestion(item2.questionId, prefix),
      correct: item2.correct,
      requiresReview: item2.requiresReview
    })))
  });
}
function createFormativeMarkingService({
  api,
  auth = null,
  crypto = globalThis.crypto
} = {}) {
  let pendingCheck = null;
  function requireSignedIn() {
    if (!auth || typeof auth.isSignedIn !== "function") return;
    if (auth.isSignedIn() !== true) {
      throw new PlatformError({ code: "AUTH_REQUIRED", category: "authentication" });
    }
  }
  function payloadKey(activityKey, activityVersion, items) {
    return JSON.stringify({ activityKey, activityVersion, items });
  }
  function resolveClientCheckId(key, supplied) {
    if (supplied) {
      const id2 = requiredString2(supplied, "INVALID_CLIENT_CHECK_ID");
      pendingCheck = { key, clientCheckId: id2 };
      return id2;
    }
    if (pendingCheck && pendingCheck.key === key) return pendingCheck.clientCheckId;
    const id = generateCheckId(crypto);
    pendingCheck = { key, clientCheckId: id };
    return id;
  }
  async function markBlock(input = {}) {
    requireSignedIn();
    assertAllowedMarkInput(input);
    assertNoForbiddenInput(input);
    const activityKey = requiredString2(input.activityKey, "ACTIVITY_KEY_REQUIRED");
    const activityVersion = requiredString2(
      resolveActivityVersion({ version: input.activityVersion }),
      "ACTIVITY_VERSION_REQUIRED"
    );
    const block = learnerSafeValue(input.block);
    const items = evidenceItems(block, input.responses).map(toApiResponse);
    if (!items.length) {
      throw new PlatformError({ code: "RESPONSES_REQUIRED", category: "validation" });
    }
    const key = payloadKey(activityKey, activityVersion, items);
    const clientCheckId = resolveClientCheckId(key, input.clientCheckId);
    try {
      const data = await api.markFormativeResponse({
        p_activity_key: activityKey,
        p_activity_version: activityVersion,
        p_responses: Object.freeze(items),
        p_client_check_id: clientCheckId,
        p_source_page: sourcePath2(input.sourcePage)
      });
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (!rows.length) {
        throw new PlatformError({
          code: "MARK_FAILED",
          category: "platform",
          learnerMessage: CHECK_FAILED_MESSAGE
        });
      }
      pendingCheck = null;
      return aggregateRows(rows, block);
    } catch (error) {
      if (error instanceof PlatformError && error.category === "authentication") throw error;
      const code = String(error?.code || error?.message || "");
      if (/FORMATIVE_RETRY_LIMIT/i.test(code)) {
        throw mapPlatformError(error, {
          operation: "mark-formative-response",
          code: "FORMATIVE_RETRY_LIMIT",
          category: "validation",
          learnerMessage: RETRY_LIMIT_MESSAGE
        });
      }
      throw mapPlatformError(error, {
        operation: "mark-formative-response",
        learnerMessage: CHECK_FAILED_MESSAGE
      });
    }
  }
  return Object.freeze({
    markBlock
  });
}

// src/core/state/platform-state.js
var PLATFORM_STATES = Object.freeze([
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
function derivePlatformState({
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
function createPlatformState(initial = "loading") {
  if (!PLATFORM_STATES.includes(initial)) {
    throw new PlatformError({ code: "INVALID_PLATFORM_STATE", category: "configuration" });
  }
  let current = Object.freeze({ status: initial, detail: null, changedAt: (/* @__PURE__ */ new Date()).toISOString() });
  const listeners = /* @__PURE__ */ new Set();
  function transition(status, detail = null) {
    if (!PLATFORM_STATES.includes(status)) {
      throw new PlatformError({ code: "INVALID_PLATFORM_STATE", category: "platform" });
    }
    current = Object.freeze({ status, detail, changedAt: (/* @__PURE__ */ new Date()).toISOString() });
    listeners.forEach((listener) => listener(current));
    return current;
  }
  function subscribe(listener) {
    if (typeof listener !== "function") return () => {
    };
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

// src/core/logging/logger.js
var SECRET_KEYS = /password|passcode|token|secret|authorization|apikey|api_key|service.?role|cookie|session/i;
var PII_KEYS = /email|student|learner|first.?name|surname|full.?name|display.?name|contact/i;
var EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
var BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
var LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 100 });
function redactString(value) {
  return String(value).replace(BEARER_PATTERN, "Bearer [REDACTED]").replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
}
function redact(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (typeof value === "string") return redactString(value);
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item2) => redact(item2, seen));
  const output = {};
  Object.entries(value).slice(0, 40).forEach(([key, item2]) => {
    if (SECRET_KEYS.test(key) || PII_KEYS.test(key)) {
      output[key] = "[REDACTED]";
    } else if (item2 instanceof Error) {
      output[key] = { name: item2.name, code: item2.code || null };
    } else {
      output[key] = redact(item2, seen);
    }
  });
  return output;
}
function createLogger({ sink = globalThis.console, level = "warn", context = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.warn;
  function write(method, event, details) {
    if ((LEVELS[method] ?? LEVELS.error) < threshold) return;
    const target = sink?.[method] || sink?.log;
    if (typeof target !== "function") return;
    target.call(sink, `[learning-platform] ${redactString(event)}`, redact({ ...context, ...details }));
  }
  return Object.freeze({
    debug: (event, details = {}) => write("debug", event, details),
    info: (event, details = {}) => write("info", event, details),
    warn: (event, details = {}) => write("warn", event, details),
    error: (event, details = {}) => write("error", event, details),
    child: (extra = {}) => createLogger({ sink, level, context: { ...context, ...extra } })
  });
}

// src/core/feature-flags/feature-flags.js
function createFeatureFlags(initial = {}) {
  let flags = Object.freeze(normalise(initial));
  let listeners = /* @__PURE__ */ new Set();
  function normalise(value) {
    return Object.fromEntries(
      Object.entries(value || {}).map(([key, enabled]) => [key, Boolean(enabled)])
    );
  }
  function snapshot() {
    return flags;
  }
  function set(next) {
    flags = Object.freeze({ ...flags, ...normalise(next) });
    listeners.forEach((listener) => listener(flags));
    return flags;
  }
  function subscribe(listener) {
    if (typeof listener !== "function") return () => {
    };
    listeners.add(listener);
    listener(flags);
    return () => listeners.delete(listener);
  }
  return Object.freeze({
    isEnabled: (name) => flags[name] === true,
    getAll: snapshot,
    set,
    subscribe
  });
}

// src/curriculum-runtime/constants.js
var CURRICULUM_CACHE_PREFIX = "lp.curriculum.cache.v1";
var SUPPORTED_SCHEMA_VERSION = "0.1.0";
var SUPPORTED_PACKAGE_VERSION = "0.1.0";
var PUBLICATION_STATES = Object.freeze([
  "PUBLISHED",
  "FALLBACK",
  "NO_PUBLICATION",
  "INCOMPATIBLE",
  "ERROR"
]);
var LEARNER_COPY = Object.freeze({
  PUBLISHED: "This teaching copy is the official published course version.",
  FALLBACK: "This page is showing the saved teaching copy because the live course version could not be loaded. You can still read and practise. Progress will not be saved to your learning record until the live version is available.",
  NO_PUBLICATION: "This course version is not officially published yet. You can still read and practise. Progress will not be saved to your learning record yet.",
  INCOMPATIBLE: "This teaching copy cannot be used as the live course version. You can still read the saved copy. Progress cannot be saved to your learning record.",
  ERROR: "The live course version could not be confirmed. You can still read the saved teaching copy. Saving progress is temporarily unavailable."
});
var LEARNER_LABELS = Object.freeze({
  PUBLISHED: "Current",
  FALLBACK: "Saved copy",
  NO_PUBLICATION: "Preview",
  INCOMPATIBLE: "Unavailable to save",
  ERROR: "Temporarily unable to save progress"
});
function firstRow(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload && typeof payload === "object") return payload;
  return null;
}

// src/curriculum-runtime/cache-manager.js
function identityKey(hubCode, courseKey) {
  return `${CURRICULUM_CACHE_PREFIX}:${String(hubCode || "")}:${String(courseKey || "")}`;
}
function curriculumCacheKey(hubCode, courseKey, publicationVersion = "latest") {
  const base = identityKey(hubCode, courseKey);
  if (!publicationVersion || publicationVersion === "latest") return base;
  return `${base}:v:${publicationVersion}`;
}
function createCacheManager(storage) {
  function read(hubCode, courseKey, publicationVersion = "latest") {
    if (!storage || typeof storage.getItem !== "function" || !hubCode || !courseKey) return null;
    const keys = [curriculumCacheKey(hubCode, courseKey, publicationVersion)];
    if (publicationVersion && publicationVersion !== "latest") {
      keys.push(curriculumCacheKey(hubCode, courseKey, "latest"));
    }
    for (const key of keys) {
      try {
        const parsed = JSON.parse(storage.getItem(key) || "null");
        if (!parsed || !parsed.package) continue;
        const cachedHub = parsed.hubCode || parsed.hubId;
        if (cachedHub !== hubCode || parsed.courseKey !== courseKey) continue;
        if (publicationVersion && publicationVersion !== "latest" && parsed.packageVersion !== publicationVersion) {
          continue;
        }
        return parsed;
      } catch {
        continue;
      }
    }
    return null;
  }
  function write(hubCode, courseKey, row, pkg, publicationVersion = "latest") {
    if (!storage || typeof storage.setItem !== "function" || !hubCode || !courseKey || !pkg) return false;
    const slot = publicationVersion || "latest";
    const record = {
      hubCode,
      hubId: hubCode,
      courseKey,
      packageVersion: row?.package_version || row?.packageVersion || pkg.version,
      schemaVersion: row?.schema_version || row?.schemaVersion,
      sourcePackageVersion: row?.source_package_version || row?.sourcePackageVersion,
      contentHash: row?.content_hash || row?.contentHash || "",
      publishedAt: row?.published_at || row?.publishedAt,
      cachedAt: (/* @__PURE__ */ new Date()).toISOString(),
      package: pkg
    };
    try {
      const key = curriculumCacheKey(hubCode, courseKey, slot);
      storage.setItem(key, JSON.stringify(record));
      const indexKey = `${identityKey(hubCode, courseKey)}:slots`;
      const slots = JSON.parse(storage.getItem(indexKey) || "[]");
      if (!slots.includes(key)) slots.push(key);
      storage.setItem(indexKey, JSON.stringify(slots));
      return true;
    } catch {
      return false;
    }
  }
  function invalidate(hubCode, courseKey) {
    if (!storage) return false;
    const prefix = identityKey(hubCode, courseKey);
    const indexKey = `${prefix}:slots`;
    let keys = [prefix, indexKey];
    try {
      keys = keys.concat(JSON.parse(storage.getItem(indexKey) || "[]"));
    } catch {
      keys = [prefix, indexKey];
    }
    if (typeof storage.key === "function" && Number.isFinite(storage.length)) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && (key === prefix || key.startsWith(`${prefix}:`))) keys.push(key);
      }
    }
    [...new Set(keys)].forEach((key) => storage.removeItem?.(key));
    return true;
  }
  return Object.freeze({ read, write, invalidate, key: curriculumCacheKey });
}

// src/curriculum-runtime/curriculum-validator.js
function createCurriculumValidator({ validatePackage } = {}) {
  function validate(pkg) {
    if (!pkg || typeof pkg !== "object") {
      return { valid: false, issues: [{ code: "INVALID_PUBLICATION", path: "package", message: "published package is missing" }] };
    }
    if (typeof validatePackage === "function") {
      const result = validatePackage(pkg);
      if (result && result.valid === false) return result;
      if (result && result.valid === true) return result;
    }
    if (!pkg.hub || !pkg.curriculum) {
      return { valid: false, issues: [{ code: "INVALID_PUBLICATION", path: "package", message: "hub and curriculum are required" }] };
    }
    return { valid: true, issues: [] };
  }
  return Object.freeze({ validate });
}

// src/curriculum-runtime/publication-resolver.js
function hydrate(row) {
  const pkg = row && row.package;
  if (!pkg || typeof pkg !== "object") {
    throw new Error("published-package-invalid");
  }
  pkg.version = row.package_version || pkg.version;
  pkg.schemaVersion = row.source_package_version || pkg.schemaVersion;
  pkg.id = pkg.id || pkg.hub?.id || "";
  pkg.indexFile = pkg.indexFile || {
    schema: "lp.content.package",
    schemaVersion: pkg.schemaVersion,
    id: pkg.id,
    version: pkg.version
  };
  return pkg;
}
function createPublicationResolver({
  api,
  fetchFn,
  projectUrl,
  publishableKey,
  getAccessToken
} = {}) {
  async function fetchPublishedPackage(hubCode, courseKey, packageVersion) {
    if (typeof api?.getPublishedCurriculumPackage === "function") {
      const payload = await api.getPublishedCurriculumPackage(hubCode, courseKey, packageVersion);
      const row2 = firstRow(payload);
      if (!row2 || !row2.package) throw new Error("publication-lookup-empty");
      return row2;
    }
    const url = String(projectUrl || "").replace(/\/+$/, "");
    const key = publishableKey || "";
    const token = (typeof getAccessToken === "function" ? getAccessToken() : null) || key;
    if (typeof fetchFn !== "function" || !url || !key || !hubCode || !courseKey) {
      throw new Error("publication-lookup-unavailable");
    }
    const body = { p_hub_code: hubCode, p_course_key: courseKey };
    if (packageVersion) body.p_package_version = packageVersion;
    const response = await fetchFn(`${url}/rest/v1/rpc/published_curriculum_package`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Profile": "api",
        "Accept-Profile": "api",
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response?.ok) throw new Error("publication-lookup-failed");
    const row = firstRow(await response.json());
    if (!row || !row.package) throw new Error("publication-lookup-empty");
    return row;
  }
  return Object.freeze({ fetchPublishedPackage, hydrate });
}

// src/curriculum-runtime/runtime-schema-loader.js
function createRuntimeSchemaLoader({
  supportedSchemaVersion = SUPPORTED_SCHEMA_VERSION,
  supportedPackageVersion = SUPPORTED_PACKAGE_VERSION
} = {}) {
  function inspect(row, pkg = row?.package) {
    const schemaVersion = row?.schema_version || row?.schemaVersion || pkg?.schemaVersion || "";
    const packageVersion = row?.source_package_version || row?.sourcePackageVersion || pkg?.schemaVersion || "";
    return Object.freeze({
      schemaVersion,
      packageVersion,
      supportedSchemaVersion,
      supportedPackageVersion,
      compatible: (!schemaVersion || schemaVersion === supportedSchemaVersion) && (!packageVersion || packageVersion === supportedPackageVersion)
    });
  }
  return Object.freeze({ inspect, supportedSchemaVersion, supportedPackageVersion });
}

// src/curriculum-runtime/published-curriculum-service.js
function mapPublication(row) {
  if (!row) return null;
  return Object.freeze({
    hub: row.hub_code || row.hubCode,
    course: row.course_key || row.courseKey,
    hubCode: row.hub_code || row.hubCode,
    courseKey: row.course_key || row.courseKey,
    version: row.package_version || row.packageVersion,
    packageVersion: row.package_version || row.packageVersion,
    schemaVersion: row.schema_version || row.schemaVersion,
    sourcePackageVersion: row.source_package_version || row.sourcePackageVersion,
    publishedAt: row.published_at || row.publishedAt,
    contentHash: row.content_hash || row.contentHash || "",
    status: row.status || "published"
  });
}
function localContext(pkg, hubCode, courseKey, schemaVersion, contentPackageVersion) {
  const curriculum = pkg?.curriculum;
  const indexVersion = pkg?.indexFile?.version || pkg?.version;
  return Object.freeze({
    hubCode: hubCode || pkg?.hub?.id || "",
    courseKey: courseKey || curriculum?.metadata?.course || "",
    packageVersion: pkg?.version || indexVersion || curriculum?.version || "",
    schemaVersion: pkg?.schemaVersion || schemaVersion || curriculum?.schemaVersion || "",
    contentPackageVersion: contentPackageVersion || ""
  });
}
function publicationResult(state, local, publication, reason) {
  return Object.freeze({
    state,
    source: state === "PUBLISHED" ? "published" : "fallback",
    label: LEARNER_LABELS[state],
    message: LEARNER_COPY[state],
    allowsSubmission: state === "PUBLISHED",
    local: local || null,
    publication: publication || null,
    reason: reason || null
  });
}
function renderPublicationStatus(state) {
  if (!state) return "";
  if (state.state === "PUBLISHED") {
    return `<p class="visually-hidden" role="status" data-publication-state="PUBLISHED">${LEARNER_COPY.PUBLISHED}</p>`;
  }
  const modifier = String(state.state || "ERROR").toLowerCase().replace(/_/g, "-");
  return `<section class="publication-banner publication-banner--${modifier}" role="status" data-publication-state="${state.state}"><strong>${LEARNER_LABELS[state.state]}</strong><p>${LEARNER_COPY[state.state]}</p></section>`;
}
function createPublishedCurriculumService(options = {}) {
  const hubCode = String(options.hubCode || "").trim();
  const courseKey = String(options.courseKey || "").trim();
  const schemaLoader = options.schemaLoader || createRuntimeSchemaLoader({
    supportedSchemaVersion: options.supportedSchemaVersion,
    supportedPackageVersion: options.supportedPackageVersion
  });
  const validator = options.validator || createCurriculumValidator({
    validatePackage: options.validatePackage
  });
  const cache = options.cache || createCacheManager(options.storage);
  const resolver = options.resolver || createPublicationResolver({
    api: options.api,
    fetchFn: options.fetch || globalThis.fetch,
    projectUrl: options.projectUrl || options.supabase?.projectUrl || options.config?.projectUrl,
    publishableKey: options.publishableKey || options.supabase?.publishableKey || options.config?.publishableKey,
    getAccessToken: options.getAccessToken || (() => options.session?.access_token)
  });
  let current = null;
  function setState(state) {
    current = state || null;
    return current;
  }
  async function fallback(reason, packageVersion) {
    const loadBundled = options.loadBundled;
    if (typeof loadBundled !== "function") {
      const cached = cache.read(hubCode, courseKey, packageVersion || "latest");
      if (cached?.package && validator.validate(cached.package).valid) {
        const state2 = publicationResult(
          "FALLBACK",
          localContext(cached.package, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
          mapPublication(cached),
          reason
        );
        return { source: "cache", package: cached.package, state: setState(state2), publication: state2.publication };
      }
      const empty = setState(publicationResult(
        reason === "incompatible" ? "INCOMPATIBLE" : reason === "invalid-package" ? "ERROR" : "NO_PUBLICATION",
        localContext(null, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
        null,
        reason
      ));
      return { source: "none", package: null, state: empty, publication: null };
    }
    const pkg = await loadBundled();
    const validation = validator.validate(pkg);
    if (!validation.valid) {
      const cached = cache.read(hubCode, courseKey, packageVersion || "latest");
      if (cached?.package && validator.validate(cached.package).valid) {
        const state2 = publicationResult(
          "FALLBACK",
          localContext(cached.package, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
          mapPublication(cached),
          reason
        );
        return { source: "cache", package: cached.package, state: setState(state2), publication: state2.publication };
      }
      throw new Error("bundled-package-invalid");
    }
    const state = publicationResult(
      "FALLBACK",
      localContext(pkg, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
      null,
      reason
    );
    return { source: "bundled", package: pkg, state: setState(state), publication: null };
  }
  async function load(packageVersion) {
    try {
      const row = await resolver.fetchPublishedPackage(hubCode, courseKey, packageVersion || void 0);
      const pkg = resolver.hydrate(row);
      if (!validator.validate(pkg).valid) return fallback("invalid-package", packageVersion);
      const schema = schemaLoader.inspect(row, pkg);
      if (!schema.compatible) return fallback("incompatible", packageVersion);
      cache.write(hubCode, courseKey, row, pkg, packageVersion || "latest");
      const state = publicationResult(
        "PUBLISHED",
        localContext(pkg, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
        mapPublication(row)
      );
      return { source: "published", package: pkg, state: setState(state), publication: state.publication };
    } catch {
      const cached = cache.read(hubCode, courseKey, packageVersion || "latest");
      if (cached?.package && validator.validate(cached.package).valid) {
        const state = publicationResult(
          "FALLBACK",
          localContext(cached.package, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
          mapPublication(cached),
          "unavailable"
        );
        return { source: "cache", package: cached.package, state: setState(state), publication: state.publication };
      }
      return fallback("unavailable", packageVersion);
    }
  }
  return Object.freeze({
    hubCode,
    courseKey,
    loadLatest: () => load(void 0),
    loadVersion: (version) => load(version),
    refresh: () => load(void 0),
    invalidate: () => cache.invalidate(hubCode, courseKey),
    getPublicationMetadata: () => current?.publication || null,
    getState: () => current,
    renderStatus: (state) => renderPublicationStatus(state || current),
    allowsSubmission: (state) => Boolean((state || current)?.allowsSubmission),
    submissionMessage: (state) => (state || current)?.message || LEARNER_COPY.ERROR
  });
}
export {
  assertSecureSubmission,
  createAssignmentService,
  createAuthService,
  createEnrolmentService,
  createFeatureFlags,
  createFormativeMarkingService,
  createLearnerApi,
  createLearnerContext,
  createLogger,
  createOnboardingService,
  createPlatformConfig,
  createPlatformState,
  createProfileService,
  createProgressService,
  createPublishedCurriculumService,
  createSessionService,
  createSubmissionService,
  createSupabaseClient,
  derivePlatformState,
  mapPlatformError,
  redact,
  toApiResponse
};
//# sourceMappingURL=advanced.esm.js.map
