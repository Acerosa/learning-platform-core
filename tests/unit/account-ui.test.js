import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOnboardingService } from "../../src/core/onboarding/onboarding-service.js";
import { createAccountDialog } from "../../src/ui/account/account-dialog.js";
import { dom, memoryStorage } from "../helpers.js";

function visibleFieldLabels(root) {
  return Array.from(root.querySelectorAll(".lp-form__field"))
    .filter((field) => !field.hidden)
    .map((field) => field.querySelector("label")?.textContent);
}

test("shared CSS hides account fields that use the hidden attribute", () => {
  const css = readFileSync(new URL("../../src/theme/theme.css", import.meta.url), "utf8");
  assert.match(css, /\.lp-form__field\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test("account dialog keeps sign-in and registration distinct and persists no credentials", async () => {
  const runtime = dom();
  const storage = memoryStorage();
  const calls = [];
  const authService = {
    isSignedIn: () => false,
    signIn: async (email, password) => { calls.push({ type: "sign-in", email, password }); },
    signUp: async (email, password) => {
      calls.push({ type: "sign-up", email, password });
      return { needsConfirmation: true };
    }
  };
  const learnerContext = {
    getState: () => ({ status: "signed-out" }),
    refresh: async () => {}
  };
  const onboardingService = createOnboardingService({
    api: {},
    authService,
    learnerContext,
    storage,
    pendingKey: "pending"
  });
  const account = createAccountDialog({
    document: runtime.window.document,
    authService,
    learnerContext,
    onboardingService
  });
  runtime.window.document.body.append(account.element);
  account.open();

  assert.deepEqual(visibleFieldLabels(account.element), ["Username", "Password"]);
  assert.equal(account.element.querySelector("#lp-account-password-confirm"), null);

  const tabs = Array.from(account.element.querySelectorAll('[role="tab"]'));
  const register = tabs.find((tab) => tab.textContent === "Create account");
  const firstName = account.element.querySelector("#lp-register-first-name");
  assert.equal(firstName.closest(".lp-form__field").hidden, true);
  register.click();
  assert.equal(firstName.closest(".lp-form__field").hidden, false);
  assert.deepEqual(visibleFieldLabels(account.element), [
    "First name",
    "Last name",
    "Student ID",
    "Email address",
    "Password"
  ]);

  firstName.value = "Ada";
  account.element.querySelector("#lp-register-surname").value = "Lovelace";
  account.element.querySelector("#lp-register-student-number").value = "000123";
  account.element.querySelector("#lp-account-email").value = "ada@example.test";
  account.element.querySelector("#lp-account-password").value = "password-123";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const pending = storage.getItem("pending");
  assert.equal(pending.includes("000123"), true);
  assert.equal(pending.includes("ada@example.test"), false);
  assert.equal(pending.includes("password-123"), false);
  assert.match(account.element.textContent, /Check your email to confirm/i);
  assert.deepEqual(calls.at(-1), { type: "sign-up", email: "ada@example.test", password: "password-123" });

  tabs.find((tab) => tab.textContent === "Sign in").click();
  assert.deepEqual(visibleFieldLabels(account.element), ["Username", "Password"]);
  account.element.querySelector("#lp-account-email").value = "ada@example.test";
  account.element.querySelector("#lp-account-password").value = "password-123";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.at(-1), { type: "sign-in", email: "ada@example.test", password: "password-123" });
});

test("account validation accepts a password without a confirmation field", () => {
  const service = createOnboardingService({
    api: {},
    authService: { isSignedIn: () => false },
    storage: memoryStorage(),
    pendingKey: "pending"
  });
  assert.deepEqual(
    service.validateAccount({ email: "ada@example.test", password: "password-123" }),
    { ok: true, value: { email: "ada@example.test", password: "password-123" } }
  );
});
