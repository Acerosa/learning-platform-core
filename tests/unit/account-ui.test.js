import test from "node:test";
import assert from "node:assert/strict";
import { createOnboardingService } from "../../src/core/onboarding/onboarding-service.js";
import { createAccountDialog } from "../../src/ui/account/account-dialog.js";
import { dom, memoryStorage } from "../helpers.js";

test("account dialog keeps sign-in and registration distinct and persists no credentials", async () => {
  const runtime = dom();
  const storage = memoryStorage();
  const authService = {
    isSignedIn: () => false,
    signIn: async () => {},
    signUp: async () => ({ needsConfirmation: true })
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

  const tabs = Array.from(account.element.querySelectorAll('[role="tab"]'));
  const register = tabs.find((tab) => tab.textContent === "Create account");
  const firstName = account.element.querySelector("#lp-register-first-name");
  assert.equal(firstName.closest(".lp-form__field").hidden, true);
  register.click();
  assert.equal(firstName.closest(".lp-form__field").hidden, false);

  firstName.value = "Ada";
  account.element.querySelector("#lp-register-surname").value = "Lovelace";
  account.element.querySelector("#lp-register-student-number").value = "000123";
  account.element.querySelector("#lp-account-email").value = "ada@example.test";
  account.element.querySelector("#lp-account-password").value = "password-123";
  account.element.querySelector("#lp-account-password-confirm").value = "password-123";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const pending = storage.getItem("pending");
  assert.equal(pending.includes("000123"), true);
  assert.equal(pending.includes("ada@example.test"), false);
  assert.equal(pending.includes("password-123"), false);
  assert.match(account.element.textContent, /Check your email to confirm/i);
});
