export { createPlatform } from "./platform.js";
export { STANDARD_NAVIGATION, NAVIGATION_MODES } from "./core/config/platform-config.js";
export {
  CONTEXT_TYPES,
  SESSION_KINDS,
  SESSION_KIND_LABELS,
  LEARNER_ACTIVITY_STATES,
  STATUS_TONES,
  WEEK_UI_FEATURES,
  mergeWeekUiFeatures
} from "./ui/contracts.js";
export { evidence, EVIDENCE_TYPES } from "./core/evidence/evidence.js";
export { PLATFORM_STATES } from "./core/state/platform-state.js";
export { PlatformError, ERROR_CATEGORIES } from "./core/errors/platform-error.js";
export { createThemeService, applyBranding, THEME_MODES, THEME_EVENT } from "./theme/theme.js";
export { createLearnerHeader } from "./ui/learner-header/learner-header.js";
export { createNavigationShell } from "./ui/navigation/navigation-shell.js";
export { createAccountDialog } from "./ui/account/account-dialog.js";
export { createOnboardingView } from "./ui/onboarding/onboarding-view.js";
export { createModal } from "./ui/modal/modal.js";
export { createToastRegion } from "./ui/notifications/toast.js";
export { createLoadingState } from "./ui/loading/loading-state.js";
export { createErrorBanner } from "./ui/errors/error-banner.js";
export { createProgressCard } from "./ui/progress-card/progress-card.js";
export { createActivityCard } from "./ui/activity-card/activity-card.js";
export { createEmptyState } from "./ui/empty-state/empty-state.js";
export { createHubShell } from "./ui/hub-shell/hub-shell.js";
export { createBreadcrumbs } from "./ui/breadcrumbs/breadcrumbs.js";
export { createStatusBadge } from "./ui/status-badge/status-badge.js";
export { createCallout } from "./ui/callout/callout.js";
export { createContextPanel } from "./ui/context-panel/context-panel.js";
export { createLearningOutcomeBadge } from "./ui/learning-outcome-badge/learning-outcome-badge.js";
export { createWeekHeader } from "./ui/week-header/week-header.js";
export { createWeekNavigation } from "./ui/week-navigation/week-navigation.js";
export { createSessionSection } from "./ui/session-section/session-section.js";
export { createWeekView } from "./ui/week-view/week-view.js";
export { runConformanceChecks, assertConformant } from "./conformance/index.js";
