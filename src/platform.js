import { createPlatformConfig } from "./core/config/platform-config.js";
import { createLogger } from "./core/logging/logger.js";
import { createFeatureFlags } from "./core/feature-flags/feature-flags.js";
import { createPlatformState } from "./core/state/platform-state.js";
import { createSupabaseClient } from "./core/api/supabase-client.js";
import { createLearnerApi } from "./core/api/learner-api.js";
import { createAuthService } from "./core/auth/auth-service.js";
import { createSessionService } from "./core/session/session-service.js";
import { createProfileService } from "./core/profile/profile-service.js";
import { createEnrolmentService } from "./core/enrolment/enrolment-service.js";
import { createAssignmentService } from "./core/assignment/assignment-service.js";
import { createProgressService } from "./core/progress/progress-service.js";
import { createLearnerContext } from "./core/learner/learner-context.js";
import { createOnboardingService } from "./core/onboarding/onboarding-service.js";
import { createSubmissionService } from "./core/submission/submission-service.js";
import { createThemeService, applyBranding } from "./theme/theme.js";

export function createPlatform(options = {}, dependencies = {}) {
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
    const enrolments = learnerState.context?.enrolments || [];
    if (enrolments.length === 0) {
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
    state,
    theme,
    features,
    initialise,
    destroy
  });
}
