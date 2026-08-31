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

// src/core/security/hub-security-baseline.js
var HUB_SECURITY_BASELINE_VERSION = "1.0";
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
export {
  HUB_SECURITY_BASELINE_VERSION,
  HUB_SECURITY_CONTROLS,
  assertConformant,
  runConformanceChecks
};
//# sourceMappingURL=conformance.esm.js.map
