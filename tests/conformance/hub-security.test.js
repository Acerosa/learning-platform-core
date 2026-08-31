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

test("approved authored HTML renderer usage does not warn", () => {
  const report = scanHubSecurity(join(fixtures, "hub-ok"));
  const html = report.results.find((item) => item.id === "HSB-11.authored-html");
  assert.equal(html.passed, true, JSON.stringify(html));
});

test("raw innerHTML in production source is an HSB-11 warning", () => {
  const report = scanHubSecurity(join(fixtures, "hub-html-warn"));
  assert.equal(report.passed, true);
  assert.ok(report.warnings >= 1);
  const html = report.results.find((item) => item.id === "HSB-11.authored-html");
  assert.equal(html.passed, false);
  assert.equal(html.severity, "warning");
});

test("vendor snapshots and hub scripts are not treated as learner production source", () => {
  const report = scanHubSecurity(join(fixtures, "hub-ok"));
  const html = report.results.find((item) => item.id === "HSB-11.authored-html");
  const invented = report.results.find((item) => item.id === "HSB-05.no-invented-default");
  assert.equal(html.passed, true, JSON.stringify(html));
  assert.equal(invented.passed, true, JSON.stringify(invented));
  assert.equal(html.severity, "warning");
});
