import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOnboardingService } from "../../src/core/onboarding/onboarding-service.js";
import { PlatformError } from "../../src/core/errors/platform-error.js";
import { createAccountDialog } from "../../src/ui/account/account-dialog.js";
import { createAuthService } from "../../src/core/auth/auth-service.js";
import { dom, fakeSupabase, memoryStorage } from "../helpers.js";

function visibleFieldLabels(root) {
  return Array.from(root.querySelectorAll(".lp-form__field"))
    .filter((field) => !field.hidden)
    .map((field) => field.querySelector("label")?.textContent);
}

function visibleText(root) {
  return root.textContent.replace(/\s+/g, " ");
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function openAccount({ authService, onboardingService } = {}) {
  const runtime = dom();
  const storage = memoryStorage();
  const calls = [];
  const service = authService || {
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
  const onboarding = onboardingService || createOnboardingService({
    api: {},
    authService: service,
    learnerContext,
    storage,
    pendingKey: "pending"
  });
  const account = createAccountDialog({
    document: runtime.window.document,
    authService: service,
    learnerContext,
    onboardingService: onboarding
  });
  runtime.window.document.body.append(account.element);
  account.open();
  return { runtime, account, calls, storage, onboarding };
}

test("shared CSS hides account fields that use the hidden attribute", () => {
  const css = readFileSync(new URL("../../src/theme/theme.css", import.meta.url), "utf8");
  assert.match(css, /\.lp-form__field\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test("account dialog keeps sign-in and registration distinct and persists no credentials", async () => {
  const { account, calls, storage, runtime } = openAccount();

  assert.deepEqual(visibleFieldLabels(account.element), ["Email", "Password"]);
  assert.equal(account.element.querySelector("#lp-account-password-confirm"), null);
  assert.match(visibleText(account.element), /New here\? Create an account first\./);
  assert.match(visibleText(account.element), /Use the email address you used when creating your account\./);
  assert.equal(visibleText(account.element).includes("Username"), false);
  assert.equal(account.element.querySelector(".lp-form__guidance").hidden, false);

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
    "Email",
    "Password"
  ]);
  assert.match(visibleText(account.element), /Use this email to sign in later\./);
  assert.match(visibleText(account.element), /Use your college Student ID\./);
  assert.equal(account.element.querySelector(".lp-form__guidance").hidden, true);

  firstName.value = "Ada";
  account.element.querySelector("#lp-register-surname").value = "Lovelace";
  account.element.querySelector("#lp-register-student-number").value = "000123";
  account.element.querySelector("#lp-account-email").value = "ada@example.test";
  account.element.querySelector("#lp-account-password").value = "password-123";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();

  const pending = storage.getItem("pending");
  assert.equal(pending.includes("000123"), true);
  assert.equal(pending.includes("ada@example.test"), false);
  assert.equal(pending.includes("password-123"), false);
  assert.match(
    account.element.textContent,
    /If this is a new account, check your email to confirm it.*already created an account on another learning hub, sign in/i
  );
  assert.deepEqual(calls.at(-1), { type: "sign-up", email: "ada@example.test", password: "password-123" });

  tabs.find((tab) => tab.textContent === "Sign in").click();
  assert.deepEqual(visibleFieldLabels(account.element), ["Email", "Password"]);
  account.element.querySelector("#lp-account-email").value = "ada@example.test";
  account.element.querySelector("#lp-account-password").value = "password-123";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.deepEqual(calls.at(-1), { type: "sign-in", email: "ada@example.test", password: "password-123" });
});

test("sign-in rejects a student ID before calling Auth", async () => {
  const { account, calls, runtime } = openAccount();
  account.element.querySelector("#lp-account-email").value = "00012345";
  account.element.querySelector("#lp-account-password").value = "password-123";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.deepEqual(calls, []);
  assert.match(account.element.querySelector(".lp-form__status").textContent, /Enter a valid email address\./);
});

test("invalid credentials show a learner-safe sign-in message", async () => {
  const client = fakeSupabase({
    authErrors: { signIn: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } }
  });
  const authService = createAuthService({ client });
  const { account, runtime } = openAccount({ authService });
  account.element.querySelector("#lp-account-email").value = "ada@example.test";
  account.element.querySelector("#lp-account-password").value = "wrong-password";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const status = account.element.querySelector(".lp-form__status").textContent;
  assert.equal(status, "Email or password is incorrect.");
  assert.equal(status.includes("Invalid login credentials"), false);
  assert.equal(client.calls.filter((call) => call.type === "sign-in").length, 1);
  assert.equal(client.calls[0].credentials.email, "ada@example.test");
});

test("unconfirmed email and signup rate limits map to learner-safe messages", async () => {
  const unconfirmed = fakeSupabase({
    authErrors: { signIn: { code: "email_not_confirmed", message: "Email not confirmed", status: 400 } }
  });
  const { account, runtime } = openAccount({ authService: createAuthService({ client: unconfirmed }) });
  account.element.querySelector("#lp-account-email").value = "ada@example.test";
  account.element.querySelector("#lp-account-password").value = "password-123";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(
    account.element.querySelector(".lp-form__status").textContent,
    "Confirm your email before signing in."
  );

  const limited = fakeSupabase({
    authErrors: { signUp: { code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 } }
  });
  const rateLimited = openAccount({ authService: createAuthService({ client: limited }) });
  const tabs = Array.from(rateLimited.account.element.querySelectorAll('[role="tab"]'));
  tabs.find((tab) => tab.textContent === "Create account").click();
  rateLimited.account.element.querySelector("#lp-register-first-name").value = "Ada";
  rateLimited.account.element.querySelector("#lp-register-surname").value = "Lovelace";
  rateLimited.account.element.querySelector("#lp-register-student-number").value = "000123";
  rateLimited.account.element.querySelector("#lp-account-email").value = "ada@example.test";
  rateLimited.account.element.querySelector("#lp-account-password").value = "password-123";
  rateLimited.account.element.querySelector("form").dispatchEvent(new rateLimited.runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(
    rateLimited.account.element.querySelector(".lp-form__status").textContent,
    "Too many account emails have been requested. Please wait a few minutes and try again."
  );
  assert.equal(limited.calls.filter((call) => call.type === "sign-up").length, 1);
  assert.equal(rateLimited.account.element.querySelector("#lp-account-password").value, "password-123");
  assert.equal(
    rateLimited.account.element.querySelector(".lp-form__status").textContent.includes("rate limit exceeded"),
    false
  );
});

test("unknown sign-in and sign-up failures stay generic", async () => {
  const signInClient = fakeSupabase({
    authErrors: { signIn: { code: "unexpected_failure", message: "database host internal", status: 500 } }
  });
  const signInAccount = openAccount({ authService: createAuthService({ client: signInClient }) });
  signInAccount.account.element.querySelector("#lp-account-email").value = "ada@example.test";
  signInAccount.account.element.querySelector("#lp-account-password").value = "password-123";
  signInAccount.account.element.querySelector("form").dispatchEvent(new signInAccount.runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(
    signInAccount.account.element.querySelector(".lp-form__status").textContent,
    "We couldn't sign you in. Please try again."
  );
  assert.equal(signInAccount.account.element.querySelector(".lp-form__status").textContent.includes("database"), false);

  const signUpClient = fakeSupabase({
    authErrors: { signUp: { code: "unexpected_failure", message: "database host internal", status: 500 } }
  });
  const signUpAccount = openAccount({ authService: createAuthService({ client: signUpClient }) });
  Array.from(signUpAccount.account.element.querySelectorAll('[role="tab"]'))
    .find((tab) => tab.textContent === "Create account")
    .click();
  signUpAccount.account.element.querySelector("#lp-register-first-name").value = "Ada";
  signUpAccount.account.element.querySelector("#lp-register-surname").value = "Lovelace";
  signUpAccount.account.element.querySelector("#lp-register-student-number").value = "000123";
  signUpAccount.account.element.querySelector("#lp-account-email").value = "ada@example.test";
  signUpAccount.account.element.querySelector("#lp-account-password").value = "password-123";
  signUpAccount.account.element.querySelector("form").dispatchEvent(new signUpAccount.runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(
    signUpAccount.account.element.querySelector(".lp-form__status").textContent,
    "We couldn't create your account. Please try again."
  );
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
  assert.deepEqual(service.validateEmail("ada@example.test"), { ok: true, value: "ada@example.test" });
  assert.deepEqual(service.validateEmail("00012345"), { ok: false, code: "INVALID_EMAIL" });
});

test("repeated signup for an existing email asks the learner to sign in", async () => {
  const runtimeCalls = [];
  const service = {
    isSignedIn: () => false,
    signIn: async () => {},
    signUp: async (email, password) => {
      runtimeCalls.push({ type: "sign-up", email, password });
      return {
        user: { id: "auth-user", identities: [] },
        session: null,
        needsConfirmation: false,
        existingAccount: true
      };
    }
  };
  const { account, runtime } = openAccount({ authService: service });
  Array.from(account.element.querySelectorAll('[role="tab"]'))
    .find((tab) => tab.textContent === "Create account")
    .click();
  account.element.querySelector("#lp-register-first-name").value = "Ada";
  account.element.querySelector("#lp-register-surname").value = "Lovelace";
  account.element.querySelector("#lp-register-student-number").value = "000123";
  account.element.querySelector("#lp-account-email").value = "ada@example.test";
  account.element.querySelector("#lp-account-password").value = "password-123";
  account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const status = account.element.querySelector(".lp-form__status").textContent;
  assert.match(status, /If this is a new account, check your email to confirm it/i);
  assert.match(status, /already created an account on another learning hub, sign in/i);
  assert.equal(status.includes("An account with this email already exists"), false);
  assert.equal(status.includes("confirmation email was sent"), false);
  assert.deepEqual(runtimeCalls, [{ type: "sign-up", email: "ada@example.test", password: "password-123" }]);
});

test("new, confirmed, and unconfirmed signup outcomes share enumeration-safe copy", async () => {
  const outcomes = [
    { needsConfirmation: true, existingAccount: false },
    { needsConfirmation: false, existingAccount: true },
    { needsConfirmation: false, existingAccount: true, unconfirmed: true }
  ];
  for (const outcome of outcomes) {
    const { account, runtime } = openAccount({
      authService: {
        isSignedIn: () => false,
        signIn: async () => {},
        signUp: async () => outcome
      }
    });
    Array.from(account.element.querySelectorAll('[role="tab"]'))
      .find((tab) => tab.textContent === "Create account")
      .click();
    account.element.querySelector("#lp-register-first-name").value = "Ada";
    account.element.querySelector("#lp-register-surname").value = "Lovelace";
    account.element.querySelector("#lp-register-student-number").value = "000123";
    account.element.querySelector("#lp-account-email").value = "ada@example.test";
    account.element.querySelector("#lp-account-password").value = "password-123";
    account.element.querySelector("form").dispatchEvent(new runtime.window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    const status = account.element.querySelector(".lp-form__status").textContent;
    assert.match(status, /If this is a new account, check your email to confirm it/i);
    assert.match(status, /already created an account on another learning hub, sign in/i);
    account.destroy();
  }
});

test("hubs can open the dialog directly on create-account", () => {
  const { account, runtime } = openAccount();
  account.close();
  account.open(null, { mode: "register" });
  assert.deepEqual(visibleFieldLabels(account.element), [
    "First name",
    "Last name",
    "Student ID",
    "Email",
    "Password"
  ]);
  assert.equal(
    runtime.window.document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    "Create account"
  );
});

test("mapped auth errors remain PlatformError instances for logging", async () => {
  const client = fakeSupabase({
    authErrors: { signIn: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } }
  });
  const auth = createAuthService({ client });
  await assert.rejects(
    () => auth.signIn("ada@example.test", "wrong-password"),
    (error) => {
      assert.equal(error instanceof PlatformError, true);
      assert.equal(error.code, "invalid_credentials");
      assert.equal(error.learnerMessage, "Email or password is incorrect.");
      assert.equal(JSON.stringify(error).includes("Invalid login credentials"), false);
      return true;
    }
  );
});
