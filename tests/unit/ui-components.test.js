import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformConfig } from "../../src/core/config/platform-config.js";
import { createLearnerHeader } from "../../src/ui/learner-header/learner-header.js";
import { createNavigationShell } from "../../src/ui/navigation/navigation-shell.js";
import { createModal } from "../../src/ui/modal/modal.js";
import { createProgressCard } from "../../src/ui/progress-card/progress-card.js";
import { createActivityCard } from "../../src/ui/activity-card/activity-card.js";
import { createErrorBanner } from "../../src/ui/errors/error-banner.js";
import { dom } from "../helpers.js";

function config() {
  return createPlatformConfig({
    hubCode: "test-hub",
    hubName: "Test Hub",
    accountPath: "./account/",
    navigation: [
      { id: "home", path: "./" },
      { id: "learning", path: "./learning/" },
      { id: "activities", path: "./activities/" },
      { id: "resources", path: "./resources/" },
      { id: "progress", path: "./progress/" },
      { id: "account", path: "./account/" },
      { id: "labs", label: "Labs", path: "./labs/" }
    ]
  });
}

test("navigation renders standard and subject-specific routes with current-page state", () => {
  const runtime = dom();
  const navigation = createNavigationShell({ document: runtime.window.document, config: config(), currentId: "activities" });
  const links = Array.from(navigation.element.querySelectorAll("a"));
  assert.equal(links.some((link) => link.textContent === "Labs"), true);
  assert.equal(navigation.element.querySelector('[aria-current="page"]').textContent, "Activities");
  const toggle = navigation.element.querySelector("button");
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  navigation.element.dispatchEvent(new runtime.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("learner header is hidden when signed out and remains stable during refresh", async () => {
  const runtime = dom();
  let listener;
  const learnerContext = { subscribe(value) { listener = value; value({ status: "signed-out", context: null }); return () => {}; } };
  let signedOut = false;
  const header = createLearnerHeader({
    document: runtime.window.document,
    learnerContext,
    authService: { signOut: async () => { signedOut = true; } },
    config: config()
  });
  assert.equal(header.element.hidden, true);
  const context = { fullName: "Ada Lovelace", yearGroup: "Year 1", contactEmail: "ada@example.test" };
  listener({ status: "authenticated", context });
  assert.equal(header.element.hidden, false);
  assert.equal(header.element.textContent.includes("Test Hub"), true);
  listener({ status: "loading", context: null });
  assert.equal(header.element.textContent.includes("Ada Lovelace"), true);
  header.element.querySelector("button").click();
  await Promise.resolve();
  assert.equal(signedOut, true);
  listener({ status: "signed-out", context: null });
  assert.equal(header.element.hidden, true);
});

test("modal has an accessible name, closes on Escape, and returns focus", () => {
  const runtime = dom();
  const trigger = runtime.window.document.createElement("button");
  runtime.window.document.body.append(trigger);
  trigger.focus();
  const modal = createModal({ document: runtime.window.document, id: "test-dialog", title: "Account" });
  runtime.window.document.body.append(modal.element);
  modal.open(trigger);
  assert.equal(modal.element.getAttribute("aria-labelledby"), "test-dialog-title");
  modal.element.dispatchEvent(new runtime.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(modal.element.hasAttribute("open"), false);
  assert.equal(runtime.window.document.activeElement, trigger);
});

test("cards and errors expose semantic, learner-readable output", () => {
  const runtime = dom();
  const progress = createProgressCard({ document: runtime.window.document, title: "Course progress", completed: 3, total: 4 });
  const activity = createActivityCard({ document: runtime.window.document, title: "Practice", href: "./practice/", activityType: "Reflection" });
  const error = createErrorBanner({ document: runtime.window.document, message: "Try again later." });
  assert.equal(progress.querySelector("progress").getAttribute("aria-label"), "75% complete");
  assert.equal(activity.tagName, "ARTICLE");
  assert.equal(error.getAttribute("role"), "alert");
});
