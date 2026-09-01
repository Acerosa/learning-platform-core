/**
 * Advanced, non-stable construction APIs.
 *
 * Hub application code should import from @learning-platform/core and use
 * createPlatform(). These exports exist for platform integration tests and
 * exceptional composition scenarios. They may change before 1.0.0.
 */
export { createPlatformConfig } from "./core/config/platform-config.js";
export { createSupabaseClient } from "./core/api/supabase-client.js";
export { createLearnerApi } from "./core/api/learner-api.js";
export { createAuthService } from "./core/auth/auth-service.js";
export { createSessionService } from "./core/session/session-service.js";
export { createLearnerContext } from "./core/learner/learner-context.js";
export { createOnboardingService } from "./core/onboarding/onboarding-service.js";
export { createProfileService } from "./core/profile/profile-service.js";
export { createEnrolmentService } from "./core/enrolment/enrolment-service.js";
export { createAssignmentService } from "./core/assignment/assignment-service.js";
export { createProgressService } from "./core/progress/progress-service.js";
export { createSubmissionService, assertSecureSubmission } from "./core/submission/submission-service.js";
export { createFormativeMarkingService } from "./core/marking/formative-marking-service.js";
export { toApiResponse } from "./core/evidence/evidence.js";
export { createPlatformState, derivePlatformState } from "./core/state/platform-state.js";
export { mapPlatformError } from "./core/errors/platform-error.js";
export { createLogger, redact } from "./core/logging/logger.js";
export { createFeatureFlags } from "./core/feature-flags/feature-flags.js";
export { createPublishedCurriculumService } from "./curriculum-runtime/index.js";
