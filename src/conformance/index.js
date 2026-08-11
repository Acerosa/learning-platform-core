import { STANDARD_NAVIGATION } from "../core/config/platform-config.js";
import { assertSecureSubmission } from "../core/submission/submission-service.js";

const MANIFEST_FIELDS = Object.freeze([
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

export function runConformanceChecks({ manifest = {}, navigation = [], submissionPayload = null, services = {}, documentRoot = null } = {}) {
  const results = [];
  const missingManifest = MANIFEST_FIELDS.filter((field) => manifest[field] === undefined || manifest[field] === "");
  results.push(result(
    "manifest.required-fields",
    missingManifest.length === 0,
    missingManifest.length ? `Missing manifest fields: ${missingManifest.join(", ")}` : "Manifest fields are present."
  ));

  const navigationIds = new Set((Array.isArray(navigation) ? navigation : []).map((item) => item?.id));
  const missingNavigation = STANDARD_NAVIGATION.map((item) => item.id).filter((id) => !navigationIds.has(id));
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

export function assertConformant(input) {
  const report = runConformanceChecks(input);
  if (!report.passed) {
    const error = new Error("Learning Hub platform conformance checks failed.");
    error.name = "ConformanceError";
    error.report = report;
    throw error;
  }
  return report;
}
