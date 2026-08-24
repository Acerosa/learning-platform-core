var LearningPlatformCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    CONTEXT_TYPES: () => CONTEXT_TYPES,
    CURRICULUM_CACHE_PREFIX: () => CURRICULUM_CACHE_PREFIX,
    ERROR_CATEGORIES: () => ERROR_CATEGORIES,
    EVIDENCE_TYPES: () => EVIDENCE_TYPES,
    LEARNER_ACTIVITY_STATES: () => LEARNER_ACTIVITY_STATES,
    NAVIGATION_MODES: () => NAVIGATION_MODES,
    PLATFORM_STATES: () => PLATFORM_STATES,
    PUBLICATION_STATES: () => PUBLICATION_STATES,
    PlatformError: () => PlatformError,
    SESSION_KINDS: () => SESSION_KINDS,
    SESSION_KIND_LABELS: () => SESSION_KIND_LABELS,
    STANDARD_NAVIGATION: () => STANDARD_NAVIGATION,
    STATUS_TONES: () => STATUS_TONES,
    THEME_EVENT: () => THEME_EVENT,
    THEME_MODES: () => THEME_MODES,
    WEEK_UI_FEATURES: () => WEEK_UI_FEATURES,
    applyBranding: () => applyBranding,
    assertConformant: () => assertConformant,
    createAccountDialog: () => createAccountDialog,
    createActivityCard: () => createActivityCard,
    createBreadcrumbs: () => createBreadcrumbs,
    createCacheManager: () => createCacheManager,
    createCallout: () => createCallout,
    createContextPanel: () => createContextPanel,
    createCurriculumValidator: () => createCurriculumValidator,
    createEmptyState: () => createEmptyState,
    createErrorBanner: () => createErrorBanner,
    createHubShell: () => createHubShell,
    createLearnerHeader: () => createLearnerHeader,
    createLearningOutcomeBadge: () => createLearningOutcomeBadge,
    createLoadingState: () => createLoadingState,
    createModal: () => createModal,
    createNavigationShell: () => createNavigationShell,
    createOnboardingView: () => createOnboardingView,
    createPlatform: () => createPlatform,
    createProgressCard: () => createProgressCard,
    createPublicationResolver: () => createPublicationResolver,
    createPublishedCurriculumService: () => createPublishedCurriculumService,
    createRuntimeSchemaLoader: () => createRuntimeSchemaLoader,
    createSessionSection: () => createSessionSection,
    createStatusBadge: () => createStatusBadge,
    createThemeService: () => createThemeService,
    createToastRegion: () => createToastRegion,
    createWeekHeader: () => createWeekHeader,
    createWeekNavigation: () => createWeekNavigation,
    createWeekView: () => createWeekView,
    curriculumCacheKey: () => curriculumCacheKey,
    evidence: () => evidence,
    mergeWeekUiFeatures: () => mergeWeekUiFeatures,
    renderPublicationStatus: () => renderPublicationStatus,
    resolvePublicationState: () => resolvePublicationState,
    runConformanceChecks: () => runConformanceChecks
  });

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
  function unwrap(result2, operation) {
    if (result2?.error) throw mapPlatformError(result2.error, { operation });
    return result2?.data ?? null;
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
      initialisePromise = client.auth.getSession().then((result2) => {
        if (result2.error) throw result2.error;
        const session = result2.data?.session || null;
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
        const result2 = await client.auth.signInWithPassword({ email: String(email || "").trim(), password });
        if (result2.error) throw result2.error;
        return publish({ status: "authenticated", session: result2.data?.session || null, error: null });
      } catch (error) {
        const mapped = mapPlatformError(error, { operation: "sign-in", category: "authentication" });
        publish({ status: "signed-out", session: null, error: mapped });
        throw mapped;
      }
    }
    async function signUp(email, password) {
      publish({ status: "signing-in", error: null });
      try {
        const result2 = await client.auth.signUp({ email: String(email || "").trim(), password });
        if (result2.error) throw result2.error;
        const session = result2.data?.session || null;
        publish({ status: session ? "authenticated" : "signed-out", session, error: null });
        return Object.freeze({ user: result2.data?.user || null, session, needsConfirmation: !session });
      } catch (error) {
        const mapped = mapPlatformError(error, { operation: "sign-up", category: "authentication" });
        publish({ status: "signed-out", session: null, error: mapped });
        throw mapped;
      }
    }
    async function signOut() {
      try {
        const result2 = await client.auth.signOut();
        if (result2?.error) throw result2.error;
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
        const result2 = await api.completeOnboarding({
          p_first_name: checked.value.firstName,
          p_surname: checked.value.surname,
          p_student_number: checked.value.studentNumber,
          p_registration_option: key
        });
        clearPending();
        await learnerContext?.refresh?.();
        return Array.isArray(result2) ? result2[0] : result2;
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
    return Object.freeze({
      question_id: questionKey(evidence2.questionKey),
      response_type: evidence2.evidenceType,
      response_payload: evidence2.value
    });
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
  var ALLOWED_FIELDS = Object.freeze([
    "activityKey",
    "activityVersion",
    "clientAttemptId",
    "responses",
    "sourcePage",
    "startedAt",
    "completedAt",
    "programmingLanguage"
  ]);
  var FORBIDDEN_FIELD = /^(learner|learnerId|learner_id|student|studentId|student_id|studentNumber|student_number|firstName|first_name|surname|email|enrolment|enrolmentId|enrolment_id|assignment|assignmentId|assignment_id|attemptNumber|attempt_number|score|totalScore|total_score|maxScore|max_score)$/i;
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
      if (FORBIDDEN_FIELD.test(key)) {
        throw new PlatformError({ code: "FORBIDDEN_SUBMISSION_FIELD", category: "submission", diagnostic: { field: key } });
      }
      if (!ALLOWED_FIELDS.includes(key)) {
        throw new PlatformError({ code: "UNRECOGNISED_SUBMISSION_FIELD", category: "submission", diagnostic: { field: key } });
      }
    });
    return true;
  }
  function createSubmissionService({ api, storage = globalThis.sessionStorage, crypto = globalThis.crypto } = {}) {
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
      const activityVersion = requiredString(input.activityVersion, "ACTIVITY_VERSION_REQUIRED");
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
      const payload = buildPayload(input);
      try {
        const result2 = await api.submitAttempt(payload);
        const key = storageKey(payload.p_activity_key);
        try {
          if (storage?.getItem(key) === payload.p_client_attempt_id) storage.removeItem(key);
        } catch {
        }
        return result2;
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

  // src/theme/theme.js
  var THEME_MODES = Object.freeze(["light", "dark", "system"]);
  var THEME_EVENT = "learningplatform:themechange";
  function safeStorage(value) {
    try {
      return value || null;
    } catch {
      return null;
    }
  }
  function createThemeService({
    document: runtimeDocument = globalThis.document,
    window: runtimeWindow = globalThis.window,
    storage = safeStorage(globalThis.localStorage),
    storageKey: storageKey2 = "learning-platform.theme.v1"
  } = {}) {
    const media = runtimeWindow?.matchMedia?.("(prefers-color-scheme: dark)") || null;
    const listeners = /* @__PURE__ */ new Set();
    let preference = readPreference();
    function readPreference() {
      try {
        const stored = storage?.getItem(storageKey2);
        return THEME_MODES.includes(stored) ? stored : "system";
      } catch {
        return "system";
      }
    }
    function resolve(mode = preference) {
      if (mode === "light" || mode === "dark") return mode;
      return media?.matches ? "dark" : "light";
    }
    function snapshot() {
      return Object.freeze({ preference, resolvedTheme: resolve() });
    }
    function apply() {
      const state = snapshot();
      const root = runtimeDocument?.documentElement;
      if (root) {
        root.dataset.theme = state.resolvedTheme;
        root.dataset.themePreference = state.preference;
        root.style.colorScheme = state.resolvedTheme;
      }
      listeners.forEach((listener) => listener(state));
      if (runtimeDocument?.dispatchEvent && runtimeWindow?.CustomEvent) {
        runtimeDocument.dispatchEvent(new runtimeWindow.CustomEvent(THEME_EVENT, { detail: state }));
      }
      return state;
    }
    function setPreference(mode) {
      if (!THEME_MODES.includes(mode)) {
        throw new PlatformError({ code: "INVALID_THEME_MODE", category: "validation" });
      }
      preference = mode;
      try {
        storage?.setItem(storageKey2, preference);
      } catch {
      }
      return apply();
    }
    function subscribe(listener) {
      if (typeof listener !== "function") return () => {
      };
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    }
    function systemChanged() {
      if (preference === "system") apply();
    }
    media?.addEventListener?.("change", systemChanged);
    if (!media?.addEventListener) media?.addListener?.(systemChanged);
    function destroy() {
      media?.removeEventListener?.("change", systemChanged);
      media?.removeListener?.(systemChanged);
      listeners.clear();
    }
    apply();
    return Object.freeze({
      getPreference: () => preference,
      getResolvedTheme: resolve,
      setPreference,
      apply,
      subscribe,
      destroy,
      storageKey: storageKey2,
      modes: THEME_MODES
    });
  }
  function applyBranding(root, { primary, accent } = {}) {
    if (!root?.style) return;
    if (primary) root.style.setProperty("--hub-primary", primary);
    if (accent) root.style.setProperty("--hub-accent", accent);
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
        const result2 = validatePackage(pkg);
        if (result2 && result2.valid === false) return result2;
        if (result2 && result2.valid === true) return result2;
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
  function resolvePublicationState(local, rows, lookupError, schemaLoader) {
    const loader = schemaLoader || createRuntimeSchemaLoader();
    if (lookupError) return publicationResult("ERROR", local, null);
    if (!local?.hubCode || !local?.courseKey) return publicationResult("ERROR", local, null);
    if (local.schemaVersion && local.schemaVersion !== loader.supportedSchemaVersion) {
      return publicationResult("INCOMPATIBLE", local, null);
    }
    if (local.contentPackageVersion && local.contentPackageVersion !== loader.supportedPackageVersion) {
      return publicationResult("INCOMPATIBLE", local, null);
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    const publication = mapPublication(row);
    if (!publication) return publicationResult("NO_PUBLICATION", local, null);
    if (publication.schemaVersion !== loader.supportedSchemaVersion || publication.sourcePackageVersion !== loader.supportedPackageVersion) {
      return publicationResult("INCOMPATIBLE", local, publication);
    }
    return publicationResult("PUBLISHED", local, publication);
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

  // src/platform.js
  function createPlatform(options = {}, dependencies = {}) {
    const config = createPlatformConfig(options);
    const logger = dependencies.logger || createLogger({ level: options.logLevel || "warn", context: { hubCode: config.hubCode } });
    const client = createSupabaseClient(config.supabase, {
      client: dependencies.supabaseClient,
      createClient: dependencies.createClient
    });
    const api = createLearnerApi({ client, logger });
    const auth = createAuthService({ client, logger });
    const session = createSessionService(auth);
    const profile = createProfileService(api);
    const enrolments = createEnrolmentService(api);
    const assignments = createAssignmentService(api);
    const progress = createProgressService(api);
    const learner = createLearnerContext({ authService: auth, profileService: profile, enrolmentService: enrolments });
    const onboarding = createOnboardingService({
      api,
      authService: auth,
      learnerContext: learner,
      storage: dependencies.sessionStorage,
      pendingKey: `learning-platform.pending-onboarding.v1:${config.hubCode}`
    });
    const submission = createSubmissionService({
      api,
      storage: dependencies.sessionStorage,
      crypto: dependencies.crypto
    });
    const features = createFeatureFlags(config.features);
    const curriculum = createPublishedCurriculumService({
      hubCode: config.hubCode,
      courseKey: config.courseKey,
      api,
      supabase: config.supabase,
      storage: dependencies.localStorage,
      fetch: dependencies.fetch,
      session: dependencies.session,
      validatePackage: dependencies.validatePackage,
      loadBundled: dependencies.loadBundled
    });
    const state = createPlatformState("loading");
    const theme = dependencies.document === null ? null : createThemeService({
      document: dependencies.document || globalThis.document,
      window: dependencies.window || globalThis.window,
      storage: dependencies.localStorage
    });
    const root = (dependencies.document || globalThis.document)?.documentElement;
    applyBranding(root, config.theme);
    const unsubscribers = [];
    unsubscribers.push(auth.subscribe((authState) => {
      if (authState.status === "signing-in") state.transition("signing-in");
      if (authState.status === "signed-out") state.transition("signed-out");
      if (authState.status === "error") state.transition("error", authState.error);
    }));
    unsubscribers.push(learner.subscribe(async (learnerState) => {
      if (learnerState.status === "loading") state.transition("loading");
      if (learnerState.status === "onboarding-required") state.transition("onboarding-required");
      if (learnerState.status === "error") state.transition("error", learnerState.error);
      if (learnerState.status !== "authenticated") return;
      state.transition("authenticated");
      const enrolments2 = learnerState.context?.enrolments || [];
      if (enrolments2.length === 0) {
        state.transition("no-enrolment");
        return;
      }
      try {
        const assignmentRows = await assignments.getAssignments();
        state.transition(Array.isArray(assignmentRows) && assignmentRows.length ? "ready" : "no-assignments");
      } catch (error) {
        state.transition("error", error);
      }
    }));
    const runtimeWindow = dependencies.window || globalThis.window;
    const offline = () => state.transition("offline");
    const online = () => learner.refresh().catch((error) => state.transition("error", error));
    runtimeWindow?.addEventListener?.("offline", offline);
    runtimeWindow?.addEventListener?.("online", online);
    async function initialise() {
      state.transition(runtimeWindow?.navigator?.onLine === false ? "offline" : "loading");
      if (runtimeWindow?.navigator?.onLine === false) return state.getState();
      await auth.initialise();
      if (auth.isSignedIn()) await learner.refresh();
      return state.getState();
    }
    function destroy() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      runtimeWindow?.removeEventListener?.("offline", offline);
      runtimeWindow?.removeEventListener?.("online", online);
      theme?.destroy();
    }
    return Object.freeze({
      config,
      auth,
      session,
      learner,
      onboarding,
      profile,
      enrolments,
      assignments,
      progress,
      submission,
      curriculum,
      state,
      theme,
      features,
      initialise,
      destroy
    });
  }

  // src/ui/contracts.js
  var CONTEXT_TYPES = Object.freeze(["exam", "assignment", "project"]);
  var SESSION_KINDS = Object.freeze([
    "session",
    "independent-study",
    "homework",
    "revision",
    "retrieval"
  ]);
  var SESSION_KIND_LABELS = Object.freeze({
    session: "Session",
    "independent-study": "Independent study",
    homework: "Homework",
    revision: "Revision",
    retrieval: "Retrieval"
  });
  var LEARNER_ACTIVITY_STATES = Object.freeze(["not-started", "in-progress", "completed"]);
  var STATUS_TONES = Object.freeze(["available", "planned", "progress", "completed"]);
  var WEEK_UI_FEATURES = Object.freeze({
    showTitle: true,
    showLearningOutcomes: true,
    showAssignmentContext: true,
    showExamContext: true,
    showProjectContext: true,
    showIndependentStudy: true,
    showProgress: true
  });
  function mergeWeekUiFeatures(features = {}) {
    return Object.freeze({ ...WEEK_UI_FEATURES, ...features });
  }
  function shouldShowContext(features, contextType) {
    if (!contextType) return false;
    if (contextType === "assignment") return features.showAssignmentContext !== false;
    if (contextType === "exam") return features.showExamContext !== false;
    if (contextType === "project") return features.showProjectContext !== false;
    return true;
  }
  function isIndependentKind(kind) {
    return kind === "independent-study" || kind === "homework";
  }

  // src/ui/dom.js
  function createElement(document, tag, options = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(options).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === "className") element.className = value;
      else if (key === "text") element.textContent = value;
      else if (key === "dataset") Object.assign(element.dataset, value);
      else if (key === "hidden") element.hidden = Boolean(value);
      else if (key in element && key !== "role") element[key] = value;
      else element.setAttribute(key, value === true ? "" : String(value));
    });
    const list = Array.isArray(children) ? children : [children];
    list.filter(Boolean).forEach((child) => element.append(child));
    return element;
  }
  function labelledValue(document, label, value) {
    const wrapper = createElement(document, "div");
    wrapper.append(
      createElement(document, "dt", { text: label }),
      createElement(document, "dd", { text: value })
    );
    return wrapper;
  }
  function formField(document, { id, label, type = "text", name = id, autocomplete, required = true } = {}) {
    const wrapper = createElement(document, "div", { className: "lp-form__field" });
    const labelElement = createElement(document, "label", { htmlFor: id, text: label });
    const input = createElement(document, "input", { id, name, type, autocomplete, required });
    wrapper.append(labelElement, input);
    return { wrapper, input };
  }

  // src/ui/learner-header/learner-header.js
  function createLearnerHeader({ document = globalThis.document, learnerContext, authService, config } = {}) {
    const element = createElement(document, "section", {
      className: "lp-learner-header",
      "aria-label": "Learner account",
      hidden: true
    });
    let lastContext = null;
    function render(state) {
      if (state?.context) lastContext = state.context;
      if (state?.status === "signed-out") lastContext = null;
      if (!lastContext) {
        element.hidden = true;
        element.replaceChildren();
        return;
      }
      const details = createElement(document, "dl", { className: "lp-learner-header__details" });
      details.append(
        labelledValue(document, "Learner", lastContext.fullName || lastContext.displayName),
        labelledValue(document, "Year group", lastContext.yearGroup || lastContext.academicYear || "Not set"),
        labelledValue(document, "Email", lastContext.contactEmail || "Not set"),
        labelledValue(document, "Current hub", config.hubName)
      );
      const actions = createElement(document, "div", { className: "lp-learner-header__actions" });
      const account = createElement(document, "a", { href: config.accountPath, text: "Account" });
      const signOut = createElement(document, "button", { className: "lp-button lp-button--secondary", type: "button", text: "Sign out" });
      signOut.addEventListener("click", () => authService.signOut());
      actions.append(account, signOut);
      element.replaceChildren(details, actions);
      element.hidden = false;
    }
    const unsubscribe = learnerContext.subscribe(render);
    return Object.freeze({ element, render, destroy() {
      unsubscribe();
      element.remove();
    } });
  }

  // src/ui/navigation/navigation-shell.js
  function createNavigationShell({
    document = globalThis.document,
    config,
    currentId = "home",
    currentIds = [],
    themeService = null,
    brandTitle,
    brandTagline,
    actions = null
  } = {}) {
    const nav = createElement(document, "nav", { className: "lp-navigation", "aria-label": "Main navigation" });
    const bar = createElement(document, "div", { className: "lp-navigation__bar" });
    const home = config.navigation.find((item2) => item2.id === "home" && item2.enabled);
    const brand = createElement(document, "a", {
      className: "lp-navigation__brand",
      href: home?.path || "./"
    });
    brand.append(createElement(document, "span", {
      className: "lp-navigation__brand-title",
      text: brandTitle || config.hubName
    }));
    if (brandTagline) {
      brand.append(createElement(document, "span", {
        className: "lp-navigation__brand-tagline",
        text: brandTagline
      }));
    }
    const listId = `lp-navigation-list-${config.hubCode}`;
    const toggle = createElement(document, "button", {
      className: "lp-button lp-button--secondary lp-navigation__toggle",
      type: "button",
      text: "Menu",
      "aria-expanded": "false",
      "aria-controls": listId,
      "aria-label": "Open main menu"
    });
    const list = createElement(document, "ul", {
      className: "lp-navigation__list",
      id: listId,
      dataset: { open: "false" }
    });
    const current = new Set([currentId, ...currentIds].filter(Boolean));
    config.navigation.filter((item2) => item2.enabled).forEach((item2) => {
      const link = createElement(document, "a", {
        className: "lp-navigation__link",
        href: item2.path,
        text: item2.label,
        "aria-current": current.has(item2.id) ? "page" : null
      });
      list.append(createElement(document, "li", {}, link));
    });
    bar.append(brand, toggle, list);
    if (themeService) {
      const label = createElement(document, "label", { className: "lp-theme-control", text: "Theme" });
      const select = createElement(document, "select", { "aria-label": "Theme preference" });
      themeService.modes.forEach((mode) => select.append(createElement(document, "option", {
        value: mode,
        text: mode[0].toUpperCase() + mode.slice(1)
      })));
      select.value = themeService.getPreference();
      select.addEventListener("change", () => themeService.setPreference(select.value));
      label.append(select);
      bar.append(label);
    }
    if (actions) {
      actions.classList.add("lp-navigation__actions");
      bar.append(actions);
    }
    nav.append(bar);
    function closeMenu(returnFocus = false) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open main menu");
      list.dataset.open = "false";
      if (returnFocus) toggle.focus();
    }
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.setAttribute("aria-label", open ? "Open main menu" : "Close main menu");
      list.dataset.open = String(!open);
    });
    const keyHandler = (event) => {
      if (event.key === "Escape") closeMenu(true);
    };
    nav.addEventListener("keydown", keyHandler);
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu(false);
    });
    return Object.freeze({
      element: nav,
      closeMenu,
      destroy() {
        nav.removeEventListener("keydown", keyHandler);
        nav.remove();
      }
    });
  }

  // src/ui/modal/modal.js
  var FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
  function createModal({ document = globalThis.document, id = "lp-dialog", title = "Dialog" } = {}) {
    const dialog = createElement(document, "dialog", {
      id,
      className: "lp-dialog",
      "aria-labelledby": `${id}-title`
    });
    const header = createElement(document, "header", { className: "lp-dialog__header" });
    const heading = createElement(document, "h2", { id: `${id}-title`, text: title });
    const closeButton = createElement(document, "button", {
      className: "lp-dialog__close",
      type: "button",
      text: "Close",
      "aria-label": `Close ${title}`
    });
    const body = createElement(document, "div", { className: "lp-dialog__body" });
    header.append(heading, closeButton);
    dialog.append(header, body);
    let returnFocus = null;
    function close() {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      returnFocus?.focus?.();
    }
    function open(trigger = document.activeElement) {
      returnFocus = trigger;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      (dialog.querySelector(FOCUSABLE) || dialog).focus?.();
    }
    function handleKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.querySelectorAll(FOCUSABLE));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    closeButton.addEventListener("click", close);
    dialog.addEventListener("keydown", handleKeydown);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    return Object.freeze({
      element: dialog,
      body,
      heading,
      open,
      close,
      setTitle(value) {
        heading.textContent = value;
        closeButton.setAttribute("aria-label", `Close ${value}`);
      },
      destroy() {
        dialog.removeEventListener("keydown", handleKeydown);
        dialog.remove();
      }
    });
  }

  // src/ui/loading/loading-state.js
  function createLoadingState({ document = globalThis.document, message = "Loading\u2026" } = {}) {
    const element = createElement(document, "div", {
      className: "lp-loading",
      role: "status",
      "aria-live": "polite"
    });
    element.append(
      createElement(document, "span", { className: "lp-loading__spinner", "aria-hidden": "true" }),
      createElement(document, "span", { text: message })
    );
    return element;
  }

  // src/ui/onboarding/onboarding-view.js
  function createOnboardingView({
    document = globalThis.document,
    onboardingService,
    onComplete = () => {
    }
  } = {}) {
    const element = createElement(document, "section", { "aria-labelledby": "lp-onboarding-title" });
    const heading = createElement(document, "h3", { id: "lp-onboarding-title", text: "Finish setting up your learner account" });
    const intro = createElement(document, "p", { text: "Enter your learner details, then choose an available course and group." });
    const form = createElement(document, "form", { className: "lp-form" });
    const firstName = formField(document, { id: "lp-onboarding-first-name", label: "First name", autocomplete: "given-name" });
    const surname = formField(document, { id: "lp-onboarding-surname", label: "Surname", autocomplete: "family-name" });
    const studentNumber = formField(document, { id: "lp-onboarding-student-number", label: "Student ID", autocomplete: "off" });
    const optionWrapper = createElement(document, "div", { className: "lp-form__field" });
    const optionLabel = createElement(document, "label", { htmlFor: "lp-registration-option", text: "Year and group" });
    const select = createElement(document, "select", { id: "lp-registration-option", name: "registrationOption", required: true });
    optionWrapper.append(optionLabel, select);
    const status = createElement(document, "p", { role: "status", "aria-live": "polite", tabIndex: -1 });
    const submit = createElement(document, "button", { className: "lp-button", type: "submit", text: "Complete setup" });
    const actions = createElement(document, "div", { className: "lp-form__actions" }, submit);
    form.append(firstName.wrapper, surname.wrapper, studentNumber.wrapper, optionWrapper, status, actions);
    element.append(heading, intro, form);
    const pending = onboardingService.getPending();
    if (pending) {
      firstName.input.value = pending.firstName || "";
      surname.input.value = pending.surname || "";
      studentNumber.input.value = pending.studentNumber || "";
    }
    async function load() {
      submit.disabled = true;
      optionWrapper.replaceChildren(createLoadingState({ document, message: "Loading available groups\u2026" }));
      try {
        const options = await onboardingService.getRegistrationOptions();
        optionWrapper.replaceChildren(optionLabel, select);
        select.replaceChildren(createElement(document, "option", { value: "", text: "Choose a year and group" }));
        options.forEach((option) => {
          const label = [option.yearGroup, option.groupName || option.groupCode, option.courseTitle].filter(Boolean).join(" \u2014 ");
          select.append(createElement(document, "option", { value: option.registrationKey, text: label }));
        });
        select.value = pending?.registrationKey || "";
        submit.disabled = options.length === 0;
        if (options.length === 0) status.textContent = "No registration options are available. Contact your tutor.";
      } catch (error) {
        optionWrapper.replaceChildren(optionLabel, select);
        status.setAttribute("role", "alert");
        status.textContent = error?.learnerMessage || "Registration options could not be loaded. Try again.";
      }
    }
    async function handleSubmit(event) {
      event.preventDefault();
      status.setAttribute("role", "status");
      status.textContent = "Completing setup\u2026";
      submit.disabled = true;
      const details = {
        firstName: firstName.input.value,
        surname: surname.input.value,
        studentNumber: studentNumber.input.value
      };
      try {
        await onboardingService.complete(details, select.value);
        status.textContent = "Your learner account is ready.";
        await onComplete();
      } catch (error) {
        status.setAttribute("role", "alert");
        status.textContent = error?.learnerMessage || "Learner setup could not be completed. Try again.";
        submit.disabled = false;
        status.focus?.();
      }
    }
    form.addEventListener("submit", handleSubmit);
    load();
    return Object.freeze({ element, load, destroy() {
      form.removeEventListener("submit", handleSubmit);
      element.remove();
    } });
  }

  // src/ui/account/account-dialog.js
  function createAccountDialog({
    document = globalThis.document,
    authService,
    learnerContext,
    onboardingService
  } = {}) {
    const modal = createModal({ document, id: "lp-account-dialog", title: "Learner account" });
    let mode = "sign-in";
    let onboardingView = null;
    function buildAuthView() {
      const container = createElement(document, "div");
      const tabs = createElement(document, "div", { className: "lp-auth-tabs", role: "tablist", "aria-label": "Account options" });
      const signInTab = createElement(document, "button", { type: "button", role: "tab", text: "Sign in", "aria-selected": "true" });
      const registerTab = createElement(document, "button", { type: "button", role: "tab", text: "Create account", "aria-selected": "false" });
      tabs.append(signInTab, registerTab);
      const form = createElement(document, "form", { className: "lp-form", noValidate: true });
      const firstName = formField(document, { id: "lp-register-first-name", label: "First name", autocomplete: "given-name" });
      const surname = formField(document, { id: "lp-register-surname", label: "Last name", autocomplete: "family-name" });
      const studentNumber = formField(document, { id: "lp-register-student-number", label: "Student ID", autocomplete: "off" });
      const email = formField(document, { id: "lp-account-email", label: "Username", type: "email", autocomplete: "username" });
      const password = formField(document, { id: "lp-account-password", label: "Password", type: "password", autocomplete: "current-password" });
      password.input.minLength = 8;
      const status = createElement(document, "p", { className: "lp-form__status", role: "status", "aria-live": "polite", tabIndex: -1 });
      const submit = createElement(document, "button", { className: "lp-button", type: "submit", text: "Sign in" });
      form.append(
        firstName.wrapper,
        surname.wrapper,
        studentNumber.wrapper,
        email.wrapper,
        password.wrapper,
        status,
        createElement(document, "div", { className: "lp-form__actions" }, submit)
      );
      container.append(tabs, form);
      function setRegisterField(field, registering) {
        field.wrapper.hidden = !registering;
        field.input.disabled = !registering;
        field.input.required = registering;
      }
      function setMode(next) {
        mode = next === "register" ? "register" : "sign-in";
        const registering = mode === "register";
        setRegisterField(firstName, registering);
        setRegisterField(surname, registering);
        setRegisterField(studentNumber, registering);
        email.wrapper.querySelector("label").textContent = registering ? "Email address" : "Username";
        email.input.autocomplete = registering ? "email" : "username";
        password.input.autocomplete = registering ? "new-password" : "current-password";
        submit.textContent = registering ? "Create account" : "Sign in";
        signInTab.setAttribute("aria-selected", String(!registering));
        registerTab.setAttribute("aria-selected", String(registering));
        status.textContent = "";
      }
      async function continueAfterAuthentication() {
        await learnerContext.refresh();
        if (learnerContext.getState().status === "onboarding-required") showOnboarding();
        else modal.close();
      }
      async function handleSubmit(event) {
        event.preventDefault();
        submit.disabled = true;
        status.setAttribute("role", "status");
        status.textContent = mode === "register" ? "Creating your account\u2026" : "Signing in\u2026";
        try {
          if (mode === "register") {
            const details = {
              firstName: firstName.input.value,
              surname: surname.input.value,
              studentNumber: studentNumber.input.value,
              email: email.input.value,
              password: password.input.value
            };
            const accountCheck = onboardingService.validateAccount(details);
            const profileCheck = onboardingService.validateProfile(details);
            if (!accountCheck.ok || !profileCheck.ok) {
              const failure = new Error("Registration details are invalid.");
              failure.code = accountCheck.code || profileCheck.code;
              throw failure;
            }
            onboardingService.savePending(details);
            const result2 = await authService.signUp(accountCheck.value.email, accountCheck.value.password);
            password.input.value = "";
            if (result2.needsConfirmation) {
              setMode("sign-in");
              email.input.value = accountCheck.value.email;
              status.textContent = "Check your email to confirm the account, then return here and sign in.";
              return;
            }
            await continueAfterAuthentication();
          } else {
            await authService.signIn(email.input.value, password.input.value);
            password.input.value = "";
            await continueAfterAuthentication();
          }
        } catch (error) {
          status.setAttribute("role", "alert");
          status.textContent = error?.learnerMessage || messageFor(error?.code);
          status.focus();
        } finally {
          submit.disabled = false;
        }
      }
      signInTab.addEventListener("click", () => setMode("sign-in"));
      registerTab.addEventListener("click", () => setMode("register"));
      form.addEventListener("submit", handleSubmit);
      setMode(mode);
      return container;
    }
    function messageFor(code) {
      const messages = {
        INVALID_EMAIL: "Enter a valid email address.",
        WEAK_PASSWORD: "Choose a password with at least 8 characters.",
        INVALID_FIRST_NAME: "Enter your first name.",
        INVALID_SURNAME: "Enter your last name.",
        INVALID_STUDENT_NUMBER: "Enter your Student ID."
      };
      return messages[code] || "The account request could not be completed. Check your details and try again.";
    }
    function showOnboarding() {
      onboardingView?.destroy();
      onboardingView = createOnboardingView({
        document,
        onboardingService,
        onComplete: () => modal.close()
      });
      modal.body.replaceChildren(onboardingView.element);
    }
    function open(trigger) {
      if (authService.isSignedIn() && learnerContext.getState().status === "onboarding-required") showOnboarding();
      else modal.body.replaceChildren(buildAuthView());
      modal.open(trigger);
    }
    return Object.freeze({
      element: modal.element,
      open,
      close: modal.close,
      showOnboarding,
      destroy() {
        onboardingView?.destroy();
        modal.destroy();
      }
    });
  }

  // src/ui/notifications/toast.js
  function createToastRegion({ document = globalThis.document, timeoutMs = 6e3 } = {}) {
    const element = createElement(document, "div", {
      className: "lp-toast-region",
      "aria-label": "Notifications",
      "aria-live": "polite",
      "aria-relevant": "additions"
    });
    function notify(message, { type = "info", persistent = false } = {}) {
      const toast = createElement(document, "div", {
        className: `lp-toast lp-toast--${type}`,
        role: type === "error" ? "alert" : "status",
        text: String(message)
      });
      element.append(toast);
      if (!persistent && timeoutMs > 0) globalThis.setTimeout?.(() => toast.remove(), timeoutMs);
      return () => toast.remove();
    }
    return Object.freeze({ element, notify, clear: () => element.replaceChildren() });
  }

  // src/ui/errors/error-banner.js
  function createErrorBanner({ document = globalThis.document, heading = "There is a problem", message = "Try again." } = {}) {
    const element = createElement(document, "section", {
      className: "lp-error-banner",
      role: "alert",
      tabIndex: -1
    });
    element.append(
      createElement(document, "h2", { text: heading }),
      createElement(document, "p", { text: message })
    );
    return element;
  }

  // src/ui/progress-card/progress-card.js
  function createProgressCard({ document = globalThis.document, title, completed = 0, total = 0, description = "" } = {}) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCompleted = Math.min(safeTotal, Math.max(0, Number(completed) || 0));
    const percentage = safeTotal ? Math.round(safeCompleted / safeTotal * 100) : 0;
    const element = createElement(document, "article", { className: "lp-card lp-progress-card" });
    element.append(createElement(document, "h2", { text: title || "Progress" }));
    if (description) element.append(createElement(document, "p", { className: "lp-card__meta", text: description }));
    element.append(
      createElement(document, "progress", {
        className: "lp-progress",
        max: safeTotal || 1,
        value: safeCompleted,
        "aria-label": `${percentage}% complete`
      }),
      createElement(document, "p", { text: `${safeCompleted} of ${safeTotal} complete (${percentage}%)` })
    );
    return element;
  }

  // src/ui/status-badge/status-badge.js
  var TONE_BY_STATUS = Object.freeze({
    available: "available",
    active: "available",
    planned: "planned",
    archived: "planned",
    "coming-soon": "planned",
    "not-started": "planned",
    "in-progress": "progress",
    progress: "progress",
    completed: "completed"
  });
  var LABEL_BY_STATUS = Object.freeze({
    available: "Available",
    active: "Available",
    planned: "Planned",
    archived: "Archived",
    "coming-soon": "Planned",
    "not-started": "Not started",
    "in-progress": "In progress",
    progress: "In progress",
    completed: "Completed"
  });
  function statusTone(status) {
    return TONE_BY_STATUS[status] || "planned";
  }
  function statusLabel(status, fallback = "") {
    return LABEL_BY_STATUS[status] || fallback || String(status || "Planned");
  }
  function createStatusBadge({
    document = globalThis.document,
    status = "planned",
    label,
    marker = true
  } = {}) {
    const tone = statusTone(status);
    const element = createElement(document, "span", {
      className: `lp-status-badge lp-status-badge--${tone}`,
      role: "status"
    });
    if (marker) {
      element.append(createElement(document, "span", { "aria-hidden": "true", text: "\u25CF" }));
      element.append(document.createTextNode(" "));
    }
    element.append(document.createTextNode(label || statusLabel(status)));
    return element;
  }

  // src/ui/activity-card/activity-card.js
  function actionLabelFor(state, fallback = "Open activity") {
    if (state === "completed") return "Review activity";
    if (state === "in-progress") return "Resume activity";
    if (state === "not-started") return "Start activity";
    return fallback;
  }
  function createActivityCard({
    document = globalThis.document,
    title,
    description = "",
    activityType = "Activity",
    duration = "",
    status = "Not started",
    state,
    href,
    actionLabel,
    badge = false,
    badgeStatus,
    headingLevel = 2
  } = {}) {
    const element = createElement(document, "article", { className: "lp-card lp-activity-card" });
    if (state) element.dataset.state = state;
    const headingTag = headingLevel === 3 ? "h3" : "h2";
    const metaParts = [activityType, duration].filter(Boolean);
    if (badge) {
      element.append(createStatusBadge({
        document,
        status: badgeStatus || state || "planned",
        label: typeof status === "string" && status !== "Not started" ? status : void 0
      }));
    }
    if (metaParts.length) {
      element.append(createElement(document, "p", { className: "lp-card__meta", text: metaParts.join(" \xB7 ") }));
    }
    element.append(createElement(document, headingTag, { text: title || "Untitled activity" }));
    if (description) element.append(createElement(document, "p", { text: description }));
    const readableStatus = state ? statusLabel(state, status) : status;
    element.append(createElement(document, "p", { className: "lp-card__meta", text: `Status: ${readableStatus}` }));
    if (href) {
      const actions = createElement(document, "div", { className: "lp-card__actions" });
      const label = actionLabel || actionLabelFor(state);
      actions.append(createElement(document, "a", { className: "lp-button", href, text: label }));
      element.append(actions);
    }
    return element;
  }

  // src/ui/empty-state/empty-state.js
  function createEmptyState({ document = globalThis.document, heading = "Nothing to show yet", message = "Check again later.", action } = {}) {
    const element = createElement(document, "section", { className: "lp-empty-state" });
    element.append(
      createElement(document, "h2", { text: heading }),
      createElement(document, "p", { text: message })
    );
    if (action?.label && action?.href) {
      element.append(createElement(document, "a", { className: "lp-button", href: action.href, text: action.label }));
    }
    return element;
  }

  // src/ui/breadcrumbs/breadcrumbs.js
  function createBreadcrumbs({
    document = globalThis.document,
    items = [],
    resolveHref
  } = {}) {
    const nav = createElement(document, "nav", {
      className: "lp-breadcrumbs",
      "aria-label": "Breadcrumb"
    });
    if (!items.length) {
      nav.hidden = true;
      return nav;
    }
    const list = createElement(document, "ol", { className: "lp-breadcrumbs__list" });
    items.forEach((item2, index) => {
      const last = index === items.length - 1;
      const li = createElement(document, "li");
      const href = item2.href || (item2.path != null && item2.path !== "" && resolveHref ? resolveHref(item2.path) : item2.path);
      if (last || !href) {
        li.append(createElement(document, "span", { text: item2.label || "", "aria-current": "page" }));
      } else {
        li.append(createElement(document, "a", { href, text: item2.label || "" }));
      }
      list.append(li);
    });
    nav.append(list);
    return nav;
  }

  // src/ui/hub-shell/hub-shell.js
  function createHubShell({
    document = globalThis.document,
    config,
    currentId = "home",
    currentIds = [],
    themeService = null,
    brandTitle,
    brandTagline,
    actions = null,
    breadcrumbs,
    pageHeader,
    footer,
    skipLabel = "Skip to main content",
    mainId = "main-content",
    learnerHeader,
    learnerContext,
    authService
  } = {}) {
    const shell = createElement(document, "div", { className: "lp-shell" });
    const skip = createElement(document, "a", {
      className: "lp-skip-link",
      href: `#${mainId}`,
      text: skipLabel
    });
    const banner = createElement(document, "header", {
      className: "lp-shell__banner",
      role: "banner"
    });
    const navigation = createNavigationShell({
      document,
      config,
      currentId,
      currentIds,
      themeService,
      brandTitle,
      brandTagline,
      actions
    });
    banner.append(navigation.element);
    const headerController = learnerHeader || (learnerContext && authService ? createLearnerHeader({ document, learnerContext, authService, config }) : null);
    const learnerMount = createElement(document, "div", { className: "lp-shell__learner" });
    if (headerController?.element) learnerMount.append(headerController.element);
    const crumbNode = breadcrumbs?.element || (Array.isArray(breadcrumbs?.items) ? createBreadcrumbs({ document, items: breadcrumbs.items, resolveHref: breadcrumbs.resolveHref }) : breadcrumbs) || null;
    let intro = null;
    if (pageHeader?.title) {
      intro = createElement(document, "header", { className: "lp-page-header" });
      intro.append(createElement(document, "h1", { text: pageHeader.title }));
      if (pageHeader.subtitle) {
        intro.append(createElement(document, "p", { className: "lp-page-header__subtitle", text: pageHeader.subtitle }));
      }
    }
    const main = createElement(document, "main", {
      className: "lp-shell__main",
      id: mainId,
      tabIndex: -1
    });
    const footerEl = createElement(document, "footer", {
      className: "lp-shell__footer",
      role: "contentinfo"
    });
    if (footer?.element) footerEl.append(footer.element);
    else if (Array.isArray(footer?.lines)) {
      footer.lines.forEach((line) => footerEl.append(createElement(document, "p", { text: line })));
    }
    shell.append(skip, banner, learnerMount);
    if (crumbNode) shell.append(crumbNode);
    if (intro) shell.append(intro);
    shell.append(main, footerEl);
    return Object.freeze({
      element: shell,
      main,
      footer: footerEl,
      navigation,
      destroy() {
        navigation.destroy();
        headerController?.destroy?.();
        shell.remove();
      }
    });
  }

  // src/ui/callout/callout.js
  var TONES = Object.freeze(["info", "success", "warning", "error"]);
  function createCallout({
    document = globalThis.document,
    tone = "info",
    title,
    message
  } = {}) {
    const resolved = TONES.includes(tone) ? tone : "info";
    const element = createElement(document, "aside", {
      className: `lp-callout lp-callout--${resolved}`,
      role: resolved === "error" ? "alert" : null
    });
    if (title) element.append(createElement(document, "strong", { text: title }));
    if (message) element.append(createElement(document, "p", { text: message }));
    return element;
  }

  // src/ui/context-panel/context-panel.js
  function createContextPanel({
    document = globalThis.document,
    contextType = "assignment",
    heading = "Context",
    items = [],
    description = "",
    action
  } = {}) {
    const type = CONTEXT_TYPES.includes(contextType) ? contextType : "assignment";
    const headingId = `lp-context-${type}`;
    const element = createElement(document, "section", {
      className: `lp-context-panel lp-panel lp-context-panel--${type}`,
      "aria-labelledby": headingId,
      dataset: { contextType: type }
    });
    element.append(createElement(document, "h2", { id: headingId, text: heading }));
    if (items.length) {
      const list = createElement(document, "dl", { className: "lp-meta-list" });
      items.forEach((item2) => list.append(labelledValue(document, item2.label, item2.value)));
      element.append(list);
    }
    if (description) element.append(createElement(document, "p", { text: description }));
    if (action?.label && action?.href) {
      const paragraph = createElement(document, "p");
      paragraph.append(createElement(document, "a", {
        className: "lp-text-link",
        href: action.href,
        text: action.label
      }));
      element.append(paragraph);
    }
    return element;
  }

  // src/ui/learning-outcome-badge/learning-outcome-badge.js
  function createLearningOutcomeBadge({
    document = globalThis.document,
    id,
    title
  } = {}) {
    const label = [id, title].filter(Boolean).join(" ");
    return createElement(document, "span", {
      className: "lp-outcome-badge",
      text: label || "Learning outcome"
    });
  }

  // src/ui/week-header/week-header.js
  function createWeekHeader({
    document = globalThis.document,
    teachingWeek,
    title = "",
    subtitle = "",
    status,
    learningOutcomes = [],
    headingLevel = 1,
    showTitle = true
  } = {}) {
    const element = createElement(document, "header", { className: "lp-week-header" });
    if (status) element.append(createStatusBadge({ document, status }));
    if (showTitle) {
      const headingText = teachingWeek ? `Week ${teachingWeek}${title ? `: ${title}` : ""}` : title || "Week";
      const level = headingLevel === 2 ? "h2" : "h1";
      element.append(createElement(document, level, { text: headingText }));
    } else if (teachingWeek) {
      element.append(createElement(document, "p", {
        className: "lp-week-header__kicker",
        text: `Teaching week ${teachingWeek}`
      }));
    }
    if (subtitle) {
      element.append(createElement(document, "p", { className: "lp-week-header__subtitle", text: subtitle }));
    }
    if (learningOutcomes.length) {
      const list = createElement(document, "ul", { className: "lp-week-header__outcomes" });
      learningOutcomes.forEach((outcome) => {
        const item2 = createElement(document, "li");
        item2.append(createLearningOutcomeBadge({
          document,
          id: outcome.id,
          title: outcome.title
        }));
        list.append(item2);
      });
      element.append(list);
    }
    return element;
  }

  // src/ui/week-navigation/week-navigation.js
  function createWeekNavigation({
    document = globalThis.document,
    previousWeek,
    nextWeek
  } = {}) {
    if (!previousWeek?.href && !nextWeek?.href) return null;
    const nav = createElement(document, "nav", {
      className: "lp-week-nav",
      "aria-label": "Week"
    });
    const list = createElement(document, "ul", { className: "lp-week-nav__list" });
    if (previousWeek?.href) {
      list.append(createElement(document, "li", {}, [
        createElement(document, "a", {
          className: "lp-text-link",
          href: previousWeek.href,
          text: previousWeek.label || "Previous week",
          rel: "prev"
        })
      ]));
    }
    if (nextWeek?.href) {
      list.append(createElement(document, "li", {}, [
        createElement(document, "a", {
          className: "lp-text-link",
          href: nextWeek.href,
          text: nextWeek.label || "Next week",
          rel: "next"
        })
      ]));
    }
    nav.append(list);
    return nav;
  }

  // src/ui/session-section/session-section.js
  function createSessionSection({
    document = globalThis.document,
    id,
    title,
    kind = "session",
    summary = "",
    defaultOpen = false,
    meta,
    children = []
  } = {}) {
    const resolvedKind = SESSION_KINDS.includes(kind) ? kind : "session";
    const details = createElement(document, "details", {
      className: "lp-session lp-panel",
      id,
      dataset: { kind: resolvedKind }
    });
    details.open = Boolean(defaultOpen);
    const kindLabel = SESSION_KIND_LABELS[resolvedKind];
    const summaryEl = createElement(document, "summary", { className: "lp-session__summary" });
    const text = createElement(document, "span", { className: "lp-session__text" });
    text.append(
      createElement(document, "h2", { className: "lp-session__heading", text: title || kindLabel }),
      createElement(document, "span", { className: "lp-session__meta", text: meta || kindLabel })
    );
    summaryEl.append(text);
    const content = createElement(document, "div", { className: "lp-session__content" });
    if (summary) content.append(createElement(document, "p", { className: "lp-panel-note", text: summary }));
    const list = createElement(document, "div", { className: "lp-activity-list" });
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach((child) => list.append(child));
    content.append(list);
    details.append(summaryEl, content);
    return details;
  }

  // src/ui/week-view/week-view.js
  function activityNode(document, activity, renderActivity) {
    if (activity?.element) return activity.element;
    if (typeof renderActivity === "function") return renderActivity(activity);
    return createActivityCard({ document, ...activity });
  }
  function sessionMeta(session) {
    if (session.meta) return session.meta;
    const count = (session.activities || []).length;
    const countLabel = `${count} ${count === 1 ? "activity" : "activities"}`;
    const kindLabel = SESSION_KIND_LABELS[session.kind] || SESSION_KIND_LABELS.session;
    return session.kind && session.kind !== "session" ? `${kindLabel} \xB7 ${countLabel}` : countLabel;
  }
  function createWeekView({
    document = globalThis.document,
    week = {},
    learningOutcomes = [],
    context = null,
    sessions = [],
    progress = null,
    previousWeek,
    nextWeek,
    features = {},
    renderActivity
  } = {}) {
    const ui = mergeWeekUiFeatures(features);
    const element = createElement(document, "div", {
      className: "lp-week",
      dataset: { week: week.id || "" }
    });
    element.append(createWeekHeader({
      document,
      teachingWeek: week.teachingWeek,
      title: week.title,
      subtitle: week.subtitle,
      status: week.status,
      learningOutcomes: ui.showLearningOutcomes ? learningOutcomes : [],
      headingLevel: week.headingLevel || 1,
      showTitle: ui.showTitle !== false
    }));
    if (context && shouldShowContext(ui, context.type || context.contextType)) {
      element.append(createContextPanel({
        document,
        contextType: context.type || context.contextType,
        heading: context.heading,
        items: context.items || [],
        description: context.description,
        action: context.action
      }));
    }
    const visibleSessions = sessions.filter((session) => {
      if (ui.showIndependentStudy === false && isIndependentKind(session.kind)) return false;
      return true;
    });
    if (!visibleSessions.length) {
      element.append(createEmptyState({
        document,
        heading: "Planned teaching week",
        message: week.emptyMessage || "Detailed session activities for this week have not been added yet.",
        action: week.emptyAction
      }));
    } else {
      visibleSessions.forEach((session) => {
        const children = (session.activities || []).map((activity) => activityNode(document, activity, renderActivity));
        element.append(createSessionSection({
          document,
          id: session.id,
          title: session.title,
          kind: session.kind,
          summary: session.summary,
          defaultOpen: session.defaultOpen,
          meta: sessionMeta(session),
          children
        }));
      });
    }
    if (ui.showProgress && progress) {
      element.append(createProgressCard({ document, ...progress }));
    }
    const navigation = createWeekNavigation({ document, previousWeek, nextWeek });
    if (navigation) element.append(navigation);
    return element;
  }

  // src/conformance/index.js
  var MANIFEST_FIELDS = Object.freeze([
    "hubCode",
    "hubName",
    "version",
    "platformVersion",
    "repository",
    "subject",
    "curriculumModel",
    "activityTypes",
    "active"
  ]);
  function result(id, passed, message, severity = "error") {
    return Object.freeze({ id, passed: Boolean(passed), severity, message });
  }
  function runConformanceChecks({ manifest = {}, navigation = [], submissionPayload = null, services = {}, documentRoot = null } = {}) {
    const results = [];
    const missingManifest = MANIFEST_FIELDS.filter((field) => manifest[field] === void 0 || manifest[field] === "");
    results.push(result(
      "manifest.required-fields",
      missingManifest.length === 0,
      missingManifest.length ? `Missing manifest fields: ${missingManifest.join(", ")}` : "Manifest fields are present."
    ));
    const navigationIds = new Set((Array.isArray(navigation) ? navigation : []).map((item2) => item2?.id));
    const missingNavigation = STANDARD_NAVIGATION.map((item2) => item2.id).filter((id) => !navigationIds.has(id));
    results.push(result(
      "navigation.standard-sections",
      missingNavigation.length === 0,
      missingNavigation.length ? `Missing navigation definitions: ${missingNavigation.join(", ")}` : "Standard navigation definitions are present.",
      "warning"
    ));
    const requiredServices = ["auth", "onboarding", "learner", "progress", "submission"];
    const missingServices = requiredServices.filter((name) => !services[name]);
    results.push(result(
      "platform.shared-services",
      missingServices.length === 0,
      missingServices.length ? `Missing shared services: ${missingServices.join(", ")}` : "Shared platform services are available."
    ));
    if (submissionPayload) {
      try {
        assertSecureSubmission(submissionPayload);
        results.push(result("submission.browser-trust-boundary", true, "Submission input contains only approved fields."));
      } catch (error) {
        results.push(result("submission.browser-trust-boundary", false, error.code || "Submission input is not secure."));
      }
    } else {
      results.push(result("submission.browser-trust-boundary", false, "No representative submission payload supplied.", "warning"));
    }
    if (documentRoot) {
      const preference = documentRoot.getAttribute?.("data-theme-preference");
      const resolved = documentRoot.getAttribute?.("data-theme");
      results.push(result(
        "theme.shared-state",
        ["light", "dark", "system"].includes(preference) && ["light", "dark"].includes(resolved),
        "Theme preference and resolved theme are exposed on the document root.",
        "warning"
      ));
    }
    const errors = results.filter((check) => !check.passed && check.severity === "error").length;
    const warnings = results.filter((check) => !check.passed && check.severity === "warning").length;
    return Object.freeze({ passed: errors === 0, errors, warnings, results: Object.freeze(results) });
  }
  function assertConformant(input) {
    const report = runConformanceChecks(input);
    if (!report.passed) {
      const error = new Error("Learning Hub platform conformance checks failed.");
      error.name = "ConformanceError";
      error.report = report;
      throw error;
    }
    return report;
  }
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=learning-platform-core.iife.js.map
