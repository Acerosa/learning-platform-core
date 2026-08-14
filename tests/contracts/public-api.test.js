import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createClient } from "@supabase/supabase-js";
import * as stableSource from "../../src/index.js";
import * as advancedSource from "../../src/advanced.js";
import { createPlatform } from "../../src/platform.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";

const STABLE_EXPORTS = Object.freeze([
  "CONTEXT_TYPES",
  "ERROR_CATEGORIES",
  "EVIDENCE_TYPES",
  "LEARNER_ACTIVITY_STATES",
  "NAVIGATION_MODES",
  "PLATFORM_STATES",
  "PlatformError",
  "SESSION_KINDS",
  "SESSION_KIND_LABELS",
  "STANDARD_NAVIGATION",
  "STATUS_TONES",
  "THEME_EVENT",
  "THEME_MODES",
  "WEEK_UI_FEATURES",
  "applyBranding",
  "assertConformant",
  "createAccountDialog",
  "createActivityCard",
  "createBreadcrumbs",
  "createCallout",
  "createContextPanel",
  "createEmptyState",
  "createErrorBanner",
  "createHubShell",
  "createLearnerHeader",
  "createLearningOutcomeBadge",
  "createLoadingState",
  "createModal",
  "createNavigationShell",
  "createOnboardingView",
  "createPlatform",
  "createProgressCard",
  "createSessionSection",
  "createStatusBadge",
  "createThemeService",
  "createToastRegion",
  "createWeekHeader",
  "createWeekNavigation",
  "createWeekView",
  "evidence",
  "mergeWeekUiFeatures",
  "runConformanceChecks"
].sort());

const ADVANCED_EXPORTS = Object.freeze([
  "assertSecureSubmission",
  "createAssignmentService",
  "createAuthService",
  "createEnrolmentService",
  "createFeatureFlags",
  "createLearnerApi",
  "createLearnerContext",
  "createLogger",
  "createOnboardingService",
  "createPlatformConfig",
  "createPlatformState",
  "createProfileService",
  "createProgressService",
  "createSessionService",
  "createSubmissionService",
  "createSupabaseClient",
  "derivePlatformState",
  "mapPlatformError",
  "redact",
  "toApiResponse"
].sort());

test("the source stable entry exposes only the official API", () => {
  assert.deepEqual(Object.keys(stableSource).sort(), STABLE_EXPORTS);
  assert.deepEqual(Object.keys(advancedSource).sort(), ADVANCED_EXPORTS);
  for (const internal of ["createSupabaseClient", "createLearnerApi", "createAuthService", "createLogger", "assertSecureSubmission"]) {
    assert.equal(internal in stableSource, false, internal);
  }
});

test("the ESM, IIFE and advanced builds expose their declared contracts", async () => {
  const esm = await import("../../dist/learning-platform-core.esm.js");
  const advanced = await import("../../dist/advanced.esm.js");
  assert.deepEqual(Object.keys(esm).sort(), STABLE_EXPORTS);
  assert.deepEqual(Object.keys(advanced).sort(), ADVANCED_EXPORTS);

  const runtime = new JSDOM("<!doctype html><html></html>", { runScripts: "outside-only" });
  runtime.window.eval(await readFile(new URL("../../dist/learning-platform-core.iife.js", import.meta.url), "utf8"));
  assert.deepEqual(Array.from(Object.keys(runtime.window.LearningPlatformCore)).sort(), STABLE_EXPORTS);
});

test("createPlatform returns the canonical service facade without raw client access", () => {
  const client = fakeSupabase();
  const platform = createPlatform({ hubCode: "contract-hub", hubName: "Contract Hub" }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  assert.deepEqual(Object.keys(platform).sort(), [
    "assignments",
    "auth",
    "config",
    "destroy",
    "enrolments",
    "features",
    "initialise",
    "learner",
    "onboarding",
    "profile",
    "progress",
    "session",
    "state",
    "submission",
    "theme"
  ]);
  for (const forbidden of ["client", "api", "logger", "supabaseClient", "unstable", "advanced"]) {
    assert.equal(forbidden in platform, false, forbidden);
  }
  platform.destroy();
});

test("package metadata pins the tested SDK and exports no deep source paths", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const installed = JSON.parse(await readFile(new URL("../../node_modules/@supabase/supabase-js/package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.peerDependencies["@supabase/supabase-js"], "2.112.3");
  assert.equal(packageJson.devDependencies["@supabase/supabase-js"], "2.112.3");
  assert.equal(installed.version, "2.112.3");
  assert.equal(packageJson.exports["./advanced"], "./dist/advanced.esm.js");
  assert.equal(packageJson.files.includes("src"), false);
});

test("the pinned Supabase SDK satisfies the supported client-construction contract", () => {
  assert.equal(typeof createClient, "function");
  assert.equal(typeof advancedSource.createSupabaseClient, "function");
  let client;
  try {
    client = advancedSource.createSupabaseClient({
      projectUrl: "https://contract.supabase.co",
      publishableKey: "contract-public-key"
    }, { createClient });
  } catch (error) {
    assert.match(String(error.message), /WebSocket/);
    return;
  }
  assert.equal(typeof client.auth.getSession, "function");
  assert.equal(typeof client.schema, "function");
  assert.equal(client.supabaseUrl, "https://contract.supabase.co");
});

test("quality CI enforces locked install, checks, conformance, audit and package validation only", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/quality.yml", import.meta.url), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/);
  for (const command of ["npm ci", "npm run check", "npm run test:conformance", "npm audit --audit-level=high", "npm pack --dry-run"]) {
    assert.equal(workflow.includes(`run: ${command}`), true, command);
  }
  assert.doesNotMatch(workflow, /\b(?:deploy|publish)\b/i);
});

test("public documentation and examples do not bypass the service/API facade", async () => {
  const docs = (await readdir(new URL("../../docs", import.meta.url)))
    .filter((name) => name.endsWith(".md"))
    .map((name) => new URL(`../../docs/${name}`, import.meta.url));
  const examples = (await readdir(new URL("../../examples", import.meta.url)))
    .filter((name) => name.endsWith(".html"))
    .map((name) => new URL(`../../examples/${name}`, import.meta.url));
  const files = [new URL("../../README.md", import.meta.url), ...docs, ...examples];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /platform\.(?:client|api)\b/, file.pathname);
    assert.doesNotMatch(content, /\.from\s*\(/, file.pathname);
  }
});

test("browser examples reference stable global exports only", async () => {
  const names = new Set();
  for (const name of await readdir(new URL("../../examples", import.meta.url))) {
    if (!name.endsWith(".html")) continue;
    const content = await readFile(new URL(`../../examples/${name}`, import.meta.url), "utf8");
    for (const match of content.matchAll(/(?<![\w-])core\.([A-Za-z0-9_]+)/g)) names.add(match[1]);
  }
  names.forEach((name) => assert.equal(STABLE_EXPORTS.includes(name), true, name));
});
