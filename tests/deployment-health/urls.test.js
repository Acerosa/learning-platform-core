import assert from "node:assert/strict";
import test from "node:test";
import {
  extractModuleAssetPaths,
  htmlReferencesTypeScriptSource,
  isJavascriptMime,
  joinUrl
} from "../../src/deployment-health/urls.js";

test("extractModuleAssetPaths finds hashed vite assets", () => {
  const html = `<script type="module" crossorigin src="./assets/main-abc123.js"></script>`;
  assert.deepEqual(extractModuleAssetPaths(html), ["./assets/main-abc123.js"]);
});

test("htmlReferencesTypeScriptSource detects undeployed source refs", () => {
  assert.equal(htmlReferencesTypeScriptSource(`<script type="module" src="./src/main.tsx"></script>`), true);
  assert.equal(htmlReferencesTypeScriptSource(`<script type="module" src="./assets/main.js"></script>`), false);
});

test("isJavascriptMime accepts common JS content types", () => {
  assert.equal(isJavascriptMime("application/javascript"), true);
  assert.equal(isJavascriptMime("text/javascript; charset=utf-8"), true);
  assert.equal(isJavascriptMime("text/html"), false);
});

test("joinUrl resolves relative asset paths against Pages base", () => {
  assert.equal(
    joinUrl("https://acerosa.github.io/tlevel-software-development-hub/", "./assets/main.js"),
    "https://acerosa.github.io/tlevel-software-development-hub/assets/main.js"
  );
});

test("joinUrl keeps absolute asset paths rooted at host origin", () => {
  assert.equal(
    joinUrl("https://acerosa.github.io/learning-platform-admin/", "/learning-platform-admin/assets/main.js"),
    "https://acerosa.github.io/learning-platform-admin/assets/main.js"
  );
});
