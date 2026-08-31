/**
 * Hub Security Baseline v1.0 — versioned platform contract.
 *
 * Hubs consume this through Core submission and the Node scanner.
 * They must not re-implement these rules independently.
 */

export const HUB_SECURITY_BASELINE_VERSION = "1.0";

export const HUB_SECURITY_CONTROLS = Object.freeze([
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

export const FORBIDDEN_IDENTITY_FIELD = /^(learner_id|learnerId|student_id|studentId|enrolment_id|enrolmentId|group_id|groupId)$/i;

export const FORBIDDEN_MARK_FIELD = /^(awarded_score|awardedScore|is_correct|isCorrect|marking_source|markingSource)$/i;

export const FORBIDDEN_SUBMISSION_FIELD = /^(learner|learnerId|learner_id|student|studentId|student_id|studentNumber|student_number|firstName|first_name|surname|email|enrolment|enrolmentId|enrolment_id|assignment|assignmentId|assignment_id|attemptNumber|attempt_number|score|totalScore|total_score|maxScore|max_score|awarded_score|awardedScore|is_correct|isCorrect|marking_source|markingSource|groupId|group_id)$/i;

export const ALLOWED_SUBMISSION_FIELDS = Object.freeze([
  "activityKey",
  "activityVersion",
  "clientAttemptId",
  "responses",
  "sourcePage",
  "startedAt",
  "completedAt",
  "programmingLanguage"
]);

export const APPROVED_BROWSER_STORAGE = Object.freeze([
  "draft responses",
  "UI state",
  "cached server progress",
  "unsent retry payloads",
  "idempotent client attempt IDs"
]);

export const AUTHORITATIVE_STORAGE_FORBIDDEN = Object.freeze([
  "final score",
  "correctness",
  "learner identity",
  "enrolment",
  "official completion",
  "official progress"
]);

/**
 * Two-part versions such as "1.0" are metadata aliases for "1.0.0".
 * This is not a silent downgrade to a different catalogue version.
 * Empty or missing versions are rejected by the caller.
 */
export function canonicalActivityVersion(value) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) return "";
  if (/^\d+\.\d+$/.test(clean)) return `${clean}.0`;
  return clean;
}

/**
 * Resolve the catalogue activity version for drafts and submission.
 * Missing, empty, or non-version tokens such as "latest" fail closed.
 */
export function resolveActivityVersion(activity) {
  if (!activity || typeof activity !== "object") return "";
  const raw = typeof activity.version === "string"
    ? activity.version
    : typeof activity.activityVersion === "string"
      ? activity.activityVersion
      : "";
  const canonical = canonicalActivityVersion(raw);
  if (!canonical) return "";
  if (/^latest$/i.test(canonical)) return "";
  if (!/^\d+\.\d+\.\d+/.test(canonical)) return "";
  return canonical;
}

export function declaredHubExceptions(packageJson) {
  const declared = packageJson?.learningPlatform?.exceptions;
  if (!Array.isArray(declared)) return Object.freeze([]);
  return Object.freeze(declared.map((item) => String(item)).filter(Boolean));
}
