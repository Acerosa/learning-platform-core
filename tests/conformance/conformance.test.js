import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runConformanceChecks, assertConformant } from "../../src/conformance/index.js";
import { createPlatformConfig } from "../../src/core/config/platform-config.js";
import { evidence } from "../../src/core/evidence/evidence.js";

const manifest = {
  hubCode: "test-hub",
  hubName: "Test Hub",
  version: "1.0.0",
  platformVersion: "0.1",
  repository: "https://example.test/test-hub",
  subject: "Test",
  curriculumModel: "course-unit-week-session-activity",
  activityTypes: ["reflection"],
  active: true
};

test("future hubs can run the shared conformance suite", () => {
  const config = createPlatformConfig({
    hubCode: "test-hub",
    hubName: "Test Hub",
    navigation: [
      { id: "home", path: "./" }, { id: "learning", path: "./learning/" },
      { id: "activities", path: "./activities/" }, { id: "resources", path: "./resources/" },
      { id: "progress", path: "./progress/" }, { id: "account", path: "./account/" }
    ]
  });
  const report = runConformanceChecks({
    manifest,
    navigation: config.navigation,
    services: { auth: {}, onboarding: {}, learner: {}, progress: {}, submission: {} },
    submissionPayload: {
      activityKey: "a",
      activityVersion: "1.0.0",
      responses: [evidence.reflection("q1", "text")]
    }
  });
  assert.equal(report.passed, true);
  assert.equal(report.errors, 0);
  assert.equal(assertConformant({
    manifest,
    navigation: config.navigation,
    services: { auth: {}, onboarding: {}, learner: {}, progress: {}, submission: {} }
  }).passed, true);
});

test("conformance fails missing manifests and shared services", () => {
  const report = runConformanceChecks({ manifest: {}, navigation: [] });
  assert.equal(report.passed, false);
  assert.ok(report.errors >= 2);
});

test("shared styles include responsive, focus, reduced-motion and theme requirements", async () => {
  const css = await readFile(new URL("../../src/theme/theme.css", import.meta.url), "utf8");
  const tokens = await readFile(new URL("../../src/theme/tokens.css", import.meta.url), "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width:/);
  assert.match(tokens, /\[data-theme="dark"\]/);
  assert.match(tokens, /--hub-primary/);
  assert.match(tokens, /--lp-focus/);
});

test("shared source remains subject-neutral", async () => {
  const files = [
    new URL("../../src/index.js", import.meta.url),
    new URL("../../src/platform.js", import.meta.url),
    new URL("../../src/curriculum-runtime/index.js", import.meta.url),
    new URL("../../src/curriculum-runtime/published-curriculum-service.js", import.meta.url)
  ];
  for (const file of files) {
    const entry = await readFile(file, "utf8");
    assert.doesNotMatch(entry, /Cyber Security|Software Development|TryHackMe|NCSC|OCR|unit-14|unit-3-cyber/i);
  }
});
