import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanHubSecurity, assertHubSecurityBaseline } from "../../src/conformance/hub-security-scanner.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test("compliant fixture hub passes Hub Security Baseline v1", () => {
  const report = scanHubSecurity(join(fixtures, "hub-ok"));
  assert.equal(report.passed, true, JSON.stringify(report.results, null, 2));
  assert.equal(assertHubSecurityBaseline(join(fixtures, "hub-ok")).passed, true);
});

test("non-compliant fixture hub fails required baseline controls", () => {
  const report = scanHubSecurity(join(fixtures, "hub-bad"));
  assert.equal(report.passed, false);
  const failed = report.results.filter((item) => !item.passed).map((item) => item.id);
  assert.ok(failed.includes("HSB-15.baseline-pin"));
  assert.ok(failed.includes("HSB-15.ci-command"));
  assert.ok(failed.includes("HSB-01.authenticated-submit"));
  assert.ok(failed.includes("HSB-03.client-marks"));
});
