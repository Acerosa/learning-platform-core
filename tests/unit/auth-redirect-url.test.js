import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  cleanAuthCallbackFromUrl,
  resolveAuthRedirectUrl
} from "../../src/core/auth/auth-redirect-url.js";
import { createAuthService } from "../../src/core/auth/auth-service.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";
import { createOnboardingService } from "../../src/core/onboarding/onboarding-service.js";

function location(url) {
  return new URL(url);
}

test("resolveAuthRedirectUrl returns hub roots for GitHub Pages deployments", () => {
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/unit-3-Cyber-Security-Hub/week-1/"),
      hubRootPath: ".."
    }),
    "https://acerosa.github.io/unit-3-Cyber-Security-Hub/"
  );
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/unit-3-Cyber-Security-Hub/"),
      hubRootPath: "."
    }),
    "https://acerosa.github.io/unit-3-Cyber-Security-Hub/"
  );
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/tlevel-software-development-hub/week-2/"),
      hubRootPath: ".."
    }),
    "https://acerosa.github.io/tlevel-software-development-hub/"
  );
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/unit-14-software-engineering-for-business-hub/"),
      hubRootPath: "."
    }),
    "https://acerosa.github.io/unit-14-software-engineering-for-business-hub/"
  );
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/Emerging-Digital-Technologies-Hub/week-1/"),
      hubRootPath: ".."
    }),
    "https://acerosa.github.io/Emerging-Digital-Technologies-Hub/"
  );
});

test("resolveAuthRedirectUrl supports localhost development roots", () => {
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("http://127.0.0.1:5173/"),
      hubRootPath: "."
    }),
    "http://127.0.0.1:5173/"
  );
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("http://localhost:5173/week-1/"),
      hubRootPath: ".."
    }),
    "http://localhost:5173/"
  );
});

test("resolveAuthRedirectUrl ignores malicious query and hash on the current page", () => {
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/tlevel-software-development-hub/?redirect=https://evil.example#access_token=abc"),
      hubRootPath: "."
    }),
    "https://acerosa.github.io/tlevel-software-development-hub/"
  );
  assert.equal(
    resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/unit-3-Cyber-Security-Hub/week-2/#foo=bar"),
      hubRootPath: ".."
    }),
    "https://acerosa.github.io/unit-3-Cyber-Security-Hub/"
  );
});

test("resolveAuthRedirectUrl rejects open-redirect style hub roots", () => {
  const invalid = (error) => error?.code === "INVALID_AUTH_REDIRECT";
  assert.throws(
    () => resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/unit-3-Cyber-Security-Hub/"),
      hubRootPath: "https://evil.example/"
    }),
    invalid
  );
  assert.throws(
    () => resolveAuthRedirectUrl({
      location: location("https://acerosa.github.io/unit-3-Cyber-Security-Hub/"),
      hubRootPath: "//evil.example/"
    }),
    invalid
  );
});

test("signUp passes emailRedirectTo from the trusted hub resolver", async () => {
  const client = fakeSupabase({ session: null });
  const auth = createAuthService({
    client,
    resolveRedirectUrl: () => "https://acerosa.github.io/unit-3-Cyber-Security-Hub/"
  });
  await auth.signUp("learner@example.test", "password-123");
  const call = client.calls.find((entry) => entry.type === "sign-up");
  assert.deepEqual(call.credentials, {
    email: "learner@example.test",
    password: "password-123",
    options: { emailRedirectTo: "https://acerosa.github.io/unit-3-Cyber-Security-Hub/" }
  });
});

test("signUp omits emailRedirectTo when no browser redirect can be resolved", async () => {
  const client = fakeSupabase({ session: null });
  const auth = createAuthService({ client, resolveRedirectUrl: () => null });
  await auth.signUp("learner@example.test", "password-123");
  const call = client.calls.find((entry) => entry.type === "sign-up");
  assert.deepEqual(call.credentials, {
    email: "learner@example.test",
    password: "password-123"
  });
});

test("auth initialise cleans Supabase callback hash after session recovery", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body></body></html>",
    { url: "https://acerosa.github.io/tlevel-software-development-hub/#access_token=test-token&refresh_token=test-refresh&type=signup" }
  );
  const { window } = dom;
  const replaceCalls = [];
  window.history.replaceState = (...args) => { replaceCalls.push(args); };
  const client = fakeSupabase({ session: { access_token: "managed-by-supabase" } });
  const auth = createAuthService({
    client,
    cleanAuthCallback: () => cleanAuthCallbackFromUrl(window.location, window.history)
  });
  await auth.initialise();
  assert.equal(replaceCalls.length, 1);
  assert.equal(replaceCalls[0][2], "/tlevel-software-development-hub/");
  assert.equal(auth.isSignedIn(), true);
});

test("onboarding pending state survives auth confirmation boundary without storing credentials", () => {
  const storage = memoryStorage();
  const service = createOnboardingService({
    api: {},
    authService: { isSignedIn: () => false },
    storage,
    pendingKey: "pending"
  });
  service.savePending({
    firstName: "Ada",
    surname: "Lovelace",
    studentNumber: "000123",
    registrationKey: "year-1-a",
    email: "ada@example.test",
    password: "never-store-this"
  });
  const raw = storage.getItem("pending");
  assert.equal(raw.includes("000123"), true);
  assert.equal(raw.includes("ada@example.test"), false);
  assert.equal(raw.includes("never-store-this"), false);
});
