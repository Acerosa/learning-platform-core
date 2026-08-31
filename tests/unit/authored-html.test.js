import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { isUnsafeAuthoredHtml, setAuthoredHtml } from "../../src/core/security/authored-html.js";
import { resolveActivityVersion } from "../../src/core/security/hub-security-baseline.js";

test("authored HTML refuse-list rejects scripted and framed markup", () => {
  assert.equal(isUnsafeAuthoredHtml("<p>Safe</p>"), false);
  assert.equal(isUnsafeAuthoredHtml('<article>Safe</article><script>window.x=1</script>'), true);
  assert.equal(isUnsafeAuthoredHtml('<iframe srcdoc="<p>x</p>"></iframe>'), true);
  assert.equal(isUnsafeAuthoredHtml('<a href="javascript:alert(1)">x</a>'), true);
  assert.equal(isUnsafeAuthoredHtml('<p onclick="alert(1)">x</p>'), true);
});

test("setAuthoredHtml renders trusted markup and fails closed for unsafe markup", () => {
  const { window } = new JSDOM("<!doctype html><p id='host'></p>");
  const host = window.document.getElementById("host");
  assert.equal(setAuthoredHtml(host, "<strong>CIA</strong>"), true);
  assert.equal(host.innerHTML, "<strong>CIA</strong>");
  assert.equal(setAuthoredHtml(host, '<p>Safe</p><script>window.__lpXss=1</script>'), false);
  assert.equal(host.innerHTML, "");
  assert.equal(host.dataset.lpHtmlRejected, "true");
});

test("resolveActivityVersion uses explicit versions and fails closed when missing", () => {
  assert.equal(resolveActivityVersion({ version: "0.1.0" }), "0.1.0");
  assert.equal(resolveActivityVersion({ version: "1.0" }), "1.0.0");
  assert.equal(resolveActivityVersion({ activityVersion: "2.0.0" }), "2.0.0");
  assert.equal(resolveActivityVersion({ version: "" }), "");
  assert.equal(resolveActivityVersion({ version: "latest" }), "");
  assert.equal(resolveActivityVersion({ version: "not-a-version" }), "");
  assert.equal(resolveActivityVersion({}), "");
  assert.equal(resolveActivityVersion(null), "");
});
