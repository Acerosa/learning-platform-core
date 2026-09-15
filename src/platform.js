import { createPlatformConfig } from "./core/config/platform-config.js";
import { createLogger } from "./core/logging/logger.js";
import { createFeatureFlags } from "./core/feature-flags/feature-flags.js";
import { createPlatformState } from "./core/state/platform-state.js";
import { createSupabaseClient } from "./core/api/supabase-client.js";
import { createLearnerApi } from "./core/api/learner-api.js";
import { createAuthService } from "./core/auth/auth-service.js";
import { isRetryableAuthNetworkError } from "./core/auth/stale-auth-session.js";
import { cleanAuthCallbackFromUrl, resolveAuthRedirectUrl } from "./core/auth/auth-redirect-url.js";
import { createSessionService } from "./core/session/session-service.js";
import { createProfileService } from "./core/profile/profile-service.js";
import { createEnrolmentService } from "./core/enrolment/enrolment-service.js";
import { createAssignmentService } from "./core/assignment/assignment-service.js";
import { createHubAccessService, isHubEnrolledStatus } from "./core/hub-access/hub-access-service.js";
import { createProgressService } from "./core/progress/progress-service.js";
import { createActivityStateSync } from "./core/progress/activity-state-sync.js";
import { resetActivityStateDedupe } from "./core/progress/activity-state.js";
import { createLearnerContext } from "./core/learner/learner-context.js";
import { createOnboardingService } from "./core/onboarding/onboarding-service.js";
import { createSubmissionService } from "./core/submission/submission-service.js";
import { createFormativeMarkingService } from "./core/marking/formative-marking-service.js";
import { createThemeService, applyBranding } from "./theme/theme.js";
import { createPublishedCurriculumService } from "./curriculum-runtime/index.js";
import { PlatformError } from "./core/errors/platform-error.js";

export function createPlatform(options = {}, dependencies = {}) {
  const config = createPlatformConfig(options);
  const logger = dependencies.logger || createLogger({ level: options.logLevel || "warn", context: { hubCode: config.hubCode } });
  const client = createSupabaseClient({
    ...config.supabase,
    hubCode: config.hubCode
  }, {
    client: dependencies.supabaseClient,
    createClient: dependencies.createClient,
    authStorage: dependencies.authStorage
  });
  const api = createLearnerApi({ client, logger });
  const runtimeWindow = dependencies.window || globalThis.window;
  const auth = createAuthService({
    client,
    logger,
    resolveRedirectUrl: () => resolveAuthRedirectUrl({
      location: runtimeWindow?.location,
      hubRootPath: config.hubRootPath
    }),
    cleanAuthCallback: () => cleanAuthCallbackFromUrl(runtimeWindow?.location, runtimeWindow?.history)
  });
  const session = createSessionService(auth);
  const profile = createProfileService(api);
  const enrolments = createEnrolmentService(api);
  const assignments = createAssignmentService(api);
  const hubAccess = createHubAccessService({
    api,
    hubCode: config.hubCode,
    courseKey: config.courseKey
  });
  const progress = createProgressService(api, {
    auth,
    storage: dependencies.localStorage,
    hubCode: config.hubCode
  });
  const learner = createLearnerContext({ authService: auth, profileService: profile, enrolmentService: enrolments });
  const onboarding = createOnboardingService({
    api,
    authService: auth,
    learnerContext: learner,
    storage: dependencies.sessionStorage,
    pendingKey: `learning-platform.pending-onboarding.v1:${config.hubCode}`,
    hubAccessService: hubAccess
  });
  const submission = createSubmissionService({
    api,
    auth,
    storage: dependencies.sessionStorage,
    crypto: dependencies.crypto
  });
  const marking = createFormativeMarkingService({
    api,
    auth,
    crypto: dependencies.crypto,
    resolveFormativeContract: options.resolveFormativeContract
      || dependencies.resolveFormativeContract
      || null
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
  const activityStateSync = createActivityStateSync({ client, auth });
  const unsubscribers = [];
  let hubEnrolmentContextSynced = false;

  unsubscribers.push(auth.subscribe((authState) => {
    if (authState.status === "signing-in") state.transition("signing-in");
    if (authState.status === "signed-out") {
      hubEnrolmentContextSynced = false;
      onboarding.clearPending();
      void activityStateSync.reset();
      state.transition("signed-out");
    }
    if (authState.status === "authenticated") {
      void activityStateSync.start();
    }
    if (authState.status === "error") state.transition("error", authState.error);
  }));

  unsubscribers.push(learner.subscribe(async (learnerState) => {
    if (learnerState.status === "signed-out") hubEnrolmentContextSynced = false;
    if (learnerState.status === "loading") state.transition("loading");
    if (learnerState.status === "onboarding-required") state.transition("onboarding-required");
    if (learnerState.status === "error") state.transition("error", learnerState.error);
    if (learnerState.status !== "authenticated") return;
    state.transition("authenticated");
    try {
      const access = await hubAccess.resolve();
      if (access.status === "profile_required") {
        state.transition("onboarding-required");
        return;
      }
      if (isHubEnrolledStatus(access.status)) {
        const preferredGroupCode = access.groupCode;
        const currentGroupCode = learner.getContext()?.groupCode || "";
        if (
          (access.status === "enrolled_created" || access.status === "enrolled_reactivated")
          && preferredGroupCode
          && currentGroupCode !== preferredGroupCode
          && !hubEnrolmentContextSynced
        ) {
          hubEnrolmentContextSynced = true;
          await learner.refresh({ preferredGroupCode });
        }
        const assignmentRows = await assignments.getHubAssignments(config.hubCode);
        state.transition(Array.isArray(assignmentRows) && assignmentRows.length ? "ready" : "no-assignments");
        return;
      }
      if (access.status === "ambiguous") {
        state.transition("error", new PlatformError({
          code: "HUB_ACCESS_AMBIGUOUS",
          category: "platform",
          learnerMessage: "Your tutor needs to place you in the correct class for this hub."
        }));
        return;
      }
      state.transition("no-enrolment");
    } catch (error) {
      state.transition("error", error);
    }
  }));

  const offline = () => state.transition("offline");
  const online = () => learner.refresh().catch((error) => state.transition("error", error));
  runtimeWindow?.addEventListener?.("offline", offline);
  runtimeWindow?.addEventListener?.("online", online);

  async function initialise() {
    state.transition(runtimeWindow?.navigator?.onLine === false ? "offline" : "loading");
    if (runtimeWindow?.navigator?.onLine === false) return state.getState();
    await auth.initialise();
    // Learner RPCs only after Auth identity is proven (not merely a cached JWT).
    if (auth.getState().status === "authenticated") await learner.refresh();
    else if (auth.getState().status === "signed-out") onboarding.clearPending();
    return state.getState();
  }

  const SESSION_REFRESH_COPY = "Your session needs to be refreshed. Please sign in again.";

  /**
   * Safe per-hub recovery: refresh Auth tokens for this hub only, re-resolve
   * hub access, reload hub assignments, and refresh UI state. Never clears
   * other hubs' auth or pending-onboarding keys. Idempotent.
   */
  async function refreshHubSession() {
    try {
      if (!auth.isSignedIn()) {
        onboarding.clearPending();
        state.transition("signed-out");
        return Object.freeze({
          ok: false,
          status: "signed-out",
          requiresSignIn: true,
          learnerMessage: SESSION_REFRESH_COPY
        });
      }

      await auth.refreshSession();
      await learner.refresh();

      const access = await hubAccess.resolve();
      if (access.status === "profile_required") {
        state.transition("onboarding-required");
        return Object.freeze({
          ok: true,
          status: "onboarding-required",
          requiresSignIn: false,
          access
        });
      }
      if (isHubEnrolledStatus(access.status)) {
        hubEnrolmentContextSynced = false;
        if (access.groupCode) {
          await learner.refresh({ preferredGroupCode: access.groupCode });
        }
        const assignmentRows = await assignments.getHubAssignments(config.hubCode);
        const next = Array.isArray(assignmentRows) && assignmentRows.length ? "ready" : "no-assignments";
        state.transition(next);
        return Object.freeze({
          ok: true,
          status: next,
          requiresSignIn: false,
          access,
          assignmentCount: Array.isArray(assignmentRows) ? assignmentRows.length : 0
        });
      }
      if (access.status === "ambiguous") {
        const error = new PlatformError({
          code: "HUB_ACCESS_AMBIGUOUS",
          category: "platform",
          learnerMessage: "Your tutor needs to place you in the correct class for this hub."
        });
        state.transition("error", error);
        return Object.freeze({
          ok: false,
          status: "error",
          requiresSignIn: false,
          access,
          error
        });
      }
      state.transition("no-enrolment");
      return Object.freeze({
        ok: true,
        status: "no-enrolment",
        requiresSignIn: false,
        access
      });
    } catch (error) {
      logger?.warn("hub.session.refresh.failed", { code: error?.code || error?.name });
      if (error?.category === "network" || isRetryableAuthNetworkError(error)) {
        state.transition("error", error);
        return Object.freeze({
          ok: false,
          status: "error",
          requiresSignIn: false,
          learnerMessage: error?.learnerMessage || "The learner service could not be reached. Check your connection and try again.",
          error
        });
      }
      onboarding.clearPending();
      if (auth.isSignedIn()) await auth.signOut();
      state.transition("signed-out");
      return Object.freeze({
        ok: false,
        status: "signed-out",
        requiresSignIn: true,
        learnerMessage: error?.learnerMessage || SESSION_REFRESH_COPY,
        error
      });
    }
  }

  function destroy() {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    runtimeWindow?.removeEventListener?.("offline", offline);
    runtimeWindow?.removeEventListener?.("online", online);
    void activityStateSync.stop();
    resetActivityStateDedupe();
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
    marking,
    curriculum,
    state,
    theme,
    features,
    initialise,
    refreshHubSession,
    destroy
  });
}
