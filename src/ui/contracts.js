export { NAVIGATION_MODES } from "../core/config/platform-config.js";

export const CONTEXT_TYPES = Object.freeze(["exam", "assignment", "project"]);

export const SESSION_KINDS = Object.freeze([
  "session",
  "independent-study",
  "homework",
  "revision",
  "retrieval"
]);

export const SESSION_KIND_LABELS = Object.freeze({
  session: "Session",
  "independent-study": "Independent study",
  homework: "Homework",
  revision: "Revision",
  retrieval: "Retrieval"
});

export const LEARNER_ACTIVITY_STATES = Object.freeze(["not-started", "in-progress", "completed"]);

export const STATUS_TONES = Object.freeze(["available", "planned", "progress", "completed"]);

export const WEEK_UI_FEATURES = Object.freeze({
  showTitle: true,
  showLearningOutcomes: true,
  showAssignmentContext: true,
  showExamContext: true,
  showProjectContext: true,
  showIndependentStudy: true,
  showProgress: true
});

export function mergeWeekUiFeatures(features = {}) {
  return Object.freeze({ ...WEEK_UI_FEATURES, ...features });
}

export function shouldShowContext(features, contextType) {
  if (!contextType) return false;
  if (contextType === "assignment") return features.showAssignmentContext !== false;
  if (contextType === "exam") return features.showExamContext !== false;
  if (contextType === "project") return features.showProjectContext !== false;
  return true;
}

export function isIndependentKind(kind) {
  return kind === "independent-study" || kind === "homework";
}
