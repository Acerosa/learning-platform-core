import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import {
  HUB_SECURITY_BASELINE_VERSION,
  declaredHubExceptions
} from "../core/security/hub-security-baseline.js";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".vite",
  "supabase"
]);

const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);

function result(id, passed, message, severity = "error", evidence = null) {
  const row = { id, passed: Boolean(passed), severity, message };
  if (evidence) row.evidence = evidence;
  return Object.freeze(row);
}

function collectFiles(root, acc = []) {
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(full, acc);
      continue;
    }
    if (CODE_EXT.has(extname(entry.name)) || entry.name === "package.json") acc.push(full);
  }
  return acc;
}

function isTestPath(rel) {
  return /(^|\/)(test|tests|__tests__|spec)(\/|$)/i.test(rel) || /\.(test|spec)\./i.test(rel);
}

function stripComments(source) {
  return String(source || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isDenyListContext(source, field) {
  return new RegExp(
    `(FORBIDDEN|strip|reject|ignore|deny|ban).{0,80}${field}|${field}.{0,80}(FORBIDDEN|strip|reject|ignore)`,
    "i"
  ).test(source);
}

function productionSources(files, root) {
  return files
    .filter((file) => CODE_EXT.has(extname(file)))
    .map((file) => {
      const raw = readFileSync(file, "utf8");
      return { file, rel: relative(root, file), source: stripComments(raw) };
    })
    .filter((item) => !isTestPath(item.rel));
}

export function scanHubSecurity(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  const files = collectFiles(root);
  const packagePath = join(root, "package.json");
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch {
    pkg = {};
  }
  const exceptions = declaredHubExceptions(pkg);
  const sources = productionSources(files, root);
  const joined = sources.map((item) => item.source).join("\n");
  const results = [];

  const baseline = pkg?.learningPlatform?.securityBaseline;
  results.push(result(
    "HSB-15.baseline-pin",
    baseline === HUB_SECURITY_BASELINE_VERSION,
    baseline === HUB_SECURITY_BASELINE_VERSION
      ? `Hub pins Hub Security Baseline ${HUB_SECURITY_BASELINE_VERSION}.`
      : `package.json learningPlatform.securityBaseline must be "${HUB_SECURITY_BASELINE_VERSION}".`
  ));

  const script = pkg?.scripts?.["check:hub-security"];
  results.push(result(
    "HSB-15.ci-command",
    typeof script === "string" && script.includes("hub-security"),
    typeof script === "string" && script.includes("hub-security")
      ? "check:hub-security is declared for CI."
      : "package.json scripts.check:hub-security is missing."
  ));

  const signedIn = /isSignedIn\s*\(/.test(joined);
  const usesCoreSubmit = /platform\.submission\.submit|createSubmissionService|assertSecureSubmission/.test(joined);
  const usesCreatePlatform = /createPlatform\s*\(/.test(joined);
  results.push(result(
    "HSB-01.authenticated-submit",
    signedIn || usesCoreSubmit || usesCreatePlatform,
    signedIn || usesCoreSubmit || usesCreatePlatform
      ? "Signed-in gate, Core submission, or createPlatform is present."
      : "No signed-in check, Core submission.submit, or createPlatform usage found."
  ));

  const identityAssign = sources.filter((item) =>
    /\b(learner_id|learnerId|student_id|studentId|enrolment_id|enrolmentId|group_id|groupId)\s*:/.test(item.source)
    && !isDenyListContext(item.source, "studentId")
    && /submit_attempt|submission\.submit|rpcPayload|p_activity_key/.test(item.source)
  );
  results.push(result(
    "HSB-02.identity-fields",
    identityAssign.length === 0,
    identityAssign.length === 0
      ? "No authoritative identity fields found on submission paths."
      : "Identity fields appear on a submission path.",
    "error",
    identityAssign[0]?.rel
  ));

  const markAssign = sources.filter((item) =>
    /\b(awarded_score|awardedScore|is_correct|isCorrect)\s*:/.test(item.source)
    && !isDenyListContext(item.source, "awarded_score")
    && !isDenyListContext(item.source, "is_correct")
    && /submit_attempt|submission\.submit|rpcPayload|p_responses/.test(item.source)
  );
  results.push(result(
    "HSB-03.client-marks",
    markAssign.length === 0,
    markAssign.length === 0
      ? "Client mark fields are not assigned on submission paths."
      : "Client mark fields appear on a submission path.",
    "error",
    markAssign[0]?.rel
  ));

  const missingVersion = sources.filter((item) =>
    /submission\.submit\s*\(/.test(item.source)
    && !/activityVersion/.test(item.source)
  );
  results.push(result(
    "HSB-05.explicit-version",
    missingVersion.length === 0,
    missingVersion.length === 0
      ? "Submission calls include an activityVersion field in the same file."
      : "A Core submission.submit call has no activityVersion in the same file.",
    "error",
    missingVersion[0]?.rel
  ));

  const inventedVersion = sources.filter((item) =>
    /activityVersion\s*:\s*[^,\n]*\|\|\s*["']0\.1\.0["']/.test(item.source)
    || /activity\.version\s*\|\|\s*["']0\.1\.0["']/.test(item.source)
  );
  results.push(result(
    "HSB-05.no-invented-default",
    inventedVersion.length === 0,
    inventedVersion.length === 0
      ? "No invented 0.1.0 activity-version default found."
      : "Activity version falls back to 0.1.0 when missing.",
    "warning",
    inventedVersion[0]?.rel
  ));

  const queryMode = sources.filter((item) =>
    /function\s+(configuredSubmissionMode|getSubmissionProvider|getMode)\s*\([\s\S]{0,400}fromQuery\s*\(/.test(item.source)
    || /(?:searchParams|URLSearchParams)[\s\S]{0,200}backend/.test(item.source)
      && /getMode|getSubmissionProvider|backendMode/.test(item.source)
      && /return/.test(item.source)
      && !/ignored|ignore/.test(item.source)
  );
  const storageMode = sources.filter((item) =>
    /function\s+(configuredSubmissionMode|getSubmissionProvider|getMode)\s*\([\s\S]{0,500}localStorage\.getItem/.test(item.source)
  );
  results.push(result(
    "HSB-12.no-learner-mode-switch",
    queryMode.length === 0 && storageMode.length === 0,
    queryMode.length === 0 && storageMode.length === 0
      ? "Submission provider is not learner-switchable via query or localStorage."
      : "Submission provider appears learner-switchable.",
    "error",
    (queryMode[0] || storageMode[0])?.rel
  ));

  const silentFallback = sources.filter((item) =>
    /catch\s*\([^)]*\)\s*\{[\s\S]{0,800}(ActivityAPI\.submitAttempt|script\.google\.com[\s\S]{0,200}submitAttempt)/.test(item.source)
  );
  results.push(result(
    "HSB-07.no-silent-gas-fallback",
    silentFallback.length === 0,
    silentFallback.length === 0
      ? "No catch-path GAS submitAttempt fallback detected."
      : "A catch path appears to call GAS submitAttempt after failure.",
    "error",
    silentFallback[0]?.rel
  ));

  const fakeSuccess = sources.filter((item) =>
    /catch\s*\([^)]*\)\s*\{[\s\S]{0,500}status\s*:\s*["']submitted["']/.test(item.source)
  );
  results.push(result(
    "HSB-13.no-fake-success",
    fakeSuccess.length === 0,
    fakeSuccess.length === 0
      ? "Submission failures do not report a submitted success status."
      : "A catch path reports status submitted.",
    "error",
    fakeSuccess[0]?.rel
  ));

  const htmlHits = sources.filter((item) =>
    /\.innerHTML\s*=|dangerouslySetInnerHTML/.test(item.source)
  );
  const htmlExempt = exceptions.includes("HSB-11");
  results.push(result(
    "HSB-11.authored-html",
    htmlHits.length === 0 || htmlExempt,
    htmlHits.length === 0
      ? "No raw innerHTML / dangerouslySetInnerHTML in production source."
      : htmlExempt
        ? "Legacy HTML rendering is recorded as exception HSB-11."
        : "Raw HTML rendering is present; use the approved shared renderer or record exception HSB-11.",
    htmlHits.length && !htmlExempt ? "warning" : "warning",
    htmlHits[0]?.rel
  ));

  const errors = results.filter((check) => !check.passed && check.severity === "error").length;
  const warnings = results.filter((check) => !check.passed && check.severity === "warning").length;
  return Object.freeze({
    passed: errors === 0,
    baselineVersion: HUB_SECURITY_BASELINE_VERSION,
    root,
    errors,
    warnings,
    exceptions,
    results: Object.freeze(results)
  });
}

export function assertHubSecurityBaseline(rootDir) {
  const report = scanHubSecurity(rootDir);
  if (!report.passed) {
    const error = new Error("Hub Security Baseline v1 checks failed.");
    error.name = "HubSecurityBaselineError";
    error.report = report;
    throw error;
  }
  return report;
}

export function formatHubSecurityReport(report) {
  const lines = [
    `Hub Security Baseline ${report.baselineVersion}: ${report.passed ? "PASS" : "FAIL"}`,
    `errors=${report.errors} warnings=${report.warnings}`
  ];
  for (const check of report.results) {
    const mark = check.passed ? "PASS" : check.severity === "warning" ? "WARN" : "FAIL";
    lines.push(`${mark} ${check.id} ${check.message}${check.evidence ? ` (${check.evidence})` : ""}`);
  }
  return lines.join("\n");
}
