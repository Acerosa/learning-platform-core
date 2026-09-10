import test from "node:test";
import assert from "node:assert/strict";
import {
  isRetryableAuthNetworkError,
  isStaleAuthSessionError
} from "../../src/core/auth/stale-auth-session.js";
import { createAuthService } from "../../src/core/auth/auth-service.js";
import { createLearnerContext } from "../../src/core/learner/learner-context.js";
import { createProfileService } from "../../src/core/profile/profile-service.js";
import { createEnrolmentService } from "../../src/core/enrolment/enrolment-service.js";
import { createLearnerApi } from "../../src/core/api/learner-api.js";
import { createPlatform } from "../../src/platform.js";
import { createAuthStorageKey } from "../../src/core/auth/auth-storage-key.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";

const PROJECT_URL = "https://hubwpkrqndorznwzvaer.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_contract-public-key";

const DELETED_USER_ERROR = {
  name: "AuthApiError",
  message: "User from sub claim in JWT does not exist",
  status: 403,
  code: "user_not_found"
};

const REFRESH_NOT_FOUND = {
  name: "AuthApiError",
  message: "Invalid Refresh Token: Refresh Token Not Found",
  status: 400,
  code: "refresh_token_not_found"
};

function learnerServices(client, auth) {
  const api = createLearnerApi({ client });
  return createLearnerContext({
    authService: auth,
    profileService: createProfileService(api),
    enrolmentService: createEnrolmentService(api)
  });
}

function makePlatform(client, { hubCode = "unit-3-cyber-security", localStorage, sessionStorage } = {}) {
  return createPlatform({
    hubCode,
    courseKey: "ocr-level-3-it",
    hubName: hubCode,
    supabase: { projectUrl: PROJECT_URL, publishableKey: PUBLISHABLE_KEY }
  }, {
    supabaseClient: client,
    localStorage: localStorage || memoryStorage(),
    sessionStorage: sessionStorage || memoryStorage(),
    document: null,
    window: null
  });
}

test("isStaleAuthSessionError recognises deleted-user and invalid-refresh signals", () => {
  assert.equal(isStaleAuthSessionError(DELETED_USER_ERROR), true);
  assert.equal(isStaleAuthSessionError(REFRESH_NOT_FOUND), true);
  assert.equal(isStaleAuthSessionError({
    name: "AuthSessionMissingError",
    message: "Auth session missing!",
    status: 400
  }), true);
  assert.equal(isStaleAuthSessionError({
    message: "Failed to fetch",
    name: "AuthRetryableFetchError",
    status: 0
  }), false);
  assert.equal(isStaleAuthSessionError({ status: 500, message: "server" }), false);
});

test("isRetryableAuthNetworkError recognises transient failures", () => {
  assert.equal(isRetryableAuthNetworkError({
    name: "AuthRetryableFetchError",
    message: "Failed to fetch",
    status: 0
  }), true);
  assert.equal(isRetryableAuthNetworkError({ status: 503, message: "unavailable" }), true);
  assert.equal(isRetryableAuthNetworkError(DELETED_USER_ERROR), false);
});

test("1: valid cached session + valid server Auth user remains signed in", async () => {
  const client = fakeSupabase({
    session: { access_token: "valid", user: { id: "auth-user" } },
    views: {
      my_profile: [{ first_name: "Ada", surname: "Lovelace", student_number: "123456" }],
      my_enrolments: [{ status: "active", group_code: "CYBER-TEST-A" }]
    }
  });
  const platform = makePlatform(client);
  await platform.initialise();
  assert.equal(platform.auth.isSignedIn(), true);
  assert.equal(platform.auth.getState().status, "authenticated");
  assert.equal(platform.learner.getState().status, "authenticated");
  assert.notEqual(platform.state.getState().status, "onboarding-required");
  assert.ok(client.calls.some((call) => call.type === "get-user"));
  platform.destroy();
});

test("2: cached session + deleted Auth user → stale recovery → Sign in", async () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const hubCode = "unit-3-cyber-security";
  const authKey = createAuthStorageKey(PROJECT_URL, hubCode);
  local.setItem(authKey, JSON.stringify({ access_token: "stale", refresh_token: "stale-r" }));
  session.setItem(`learning-platform.pending-onboarding.v1:${hubCode}`, JSON.stringify({
    firstName: "Stale", surname: "User", studentNumber: "999"
  }));

  const client = fakeSupabase({
    session: { access_token: "stale", user: { id: "deleted-user" } },
    authErrors: { getUser: DELETED_USER_ERROR }
  });
  const platform = makePlatform(client, { hubCode, localStorage: local, sessionStorage: session });
  await platform.initialise();

  assert.equal(platform.auth.isSignedIn(), false);
  assert.equal(platform.auth.getState().status, "signed-out");
  assert.equal(platform.auth.getState().error?.code, "AUTH_SESSION_STALE");
  assert.match(platform.auth.getState().error.learnerMessage, /no longer valid/i);
  assert.equal(platform.state.getState().status, "signed-out");
  assert.equal(session.getItem(`learning-platform.pending-onboarding.v1:${hubCode}`), null);
  assert.ok(client.calls.some((call) => call.type === "sign-out" && call.options?.scope === "local"));
  assert.equal(client.calls.some((call) => call.type === "view"), false);
  assert.equal(client.calls.some((call) => call.type === "rpc" && call.name === "complete_learner_onboarding"), false);
  platform.destroy();
});

test("3/4/5: stale session must not produce onboarding-required or identity fields", async () => {
  const client = fakeSupabase({
    session: { access_token: "stale", user: { id: "deleted-user" } },
    authErrors: { getUser: DELETED_USER_ERROR },
    views: { my_profile: [] }
  });
  const platform = makePlatform(client);
  await platform.initialise();

  assert.equal(platform.state.getState().status, "signed-out");
  assert.notEqual(platform.state.getState().status, "onboarding-required");
  assert.notEqual(platform.learner.getState().status, "onboarding-required");
  assert.equal(client.calls.some((call) => call.type === "rpc" && call.name === "complete_learner_onboarding"), false);
  assert.equal(client.calls.some((call) => call.type === "view" && call.view === "my_profile"), false);
  assert.equal(client.calls.some((call) => call.type === "rpc" && call.name === "ensure_learner_auth_link"), false);
  // Hubs render JoinClass identity fields only for onboarding-required / authenticated-without-profile.
  // Stale recovery is signed-out → Sign in UI only.
  platform.destroy();
});

test("6: valid Auth user + missing learner profile → genuine onboarding still works", async () => {
  const client = fakeSupabase({
    session: { access_token: "valid", user: { id: "auth-user" } },
    views: { my_profile: [], my_enrolments: [] }
  });
  const platform = makePlatform(client);
  await platform.initialise();
  assert.equal(platform.auth.isSignedIn(), true);
  assert.equal(platform.auth.getState().status, "authenticated");
  assert.equal(platform.learner.getState().status, "onboarding-required");
  assert.equal(platform.state.getState().status, "onboarding-required");
  platform.destroy();
});

test("7: temporary network failure during getUser does NOT clear session", async () => {
  const client = fakeSupabase({
    session: { access_token: "valid", user: { id: "auth-user" } },
    authErrors: {
      getUser: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }
    }
  });
  const platform = makePlatform(client);
  await platform.initialise();
  assert.equal(Boolean(platform.auth.getSession()), true);
  assert.equal(platform.auth.getState().status, "error");
  assert.equal(platform.auth.getState().error.category, "network");
  assert.equal(client.calls.some((call) => call.type === "sign-out"), false);
  assert.notEqual(platform.state.getState().status, "onboarding-required");
  platform.destroy();
});

test("8: refresh token invalid clears affected hub only", async () => {
  const local = memoryStorage();
  const sessionStore = memoryStorage();
  const cyberKey = createAuthStorageKey(PROJECT_URL, "unit-3-cyber-security");
  const tlevelKey = createAuthStorageKey(PROJECT_URL, "tlevel-software-development");
  local.setItem(cyberKey, "cyber-session");
  local.setItem(tlevelKey, "tlevel-session");
  sessionStore.setItem("learning-platform.pending-onboarding.v1:unit-3-cyber-security", "{}");
  sessionStore.setItem("learning-platform.pending-onboarding.v1:tlevel-software-development", "{}");

  const client = fakeSupabase({
    session: { access_token: "a", user: { id: "auth-user" } },
    authErrors: { refreshSession: REFRESH_NOT_FOUND }
  });
  const platform = makePlatform(client, {
    hubCode: "unit-3-cyber-security",
    localStorage: local,
    sessionStorage: sessionStore
  });
  // Force authenticated without relying on getUser for this refresh-focused case:
  // initialise validates via getUser (ok), then refresh fails terminal.
  await platform.auth.initialise();
  assert.equal(platform.auth.isSignedIn(), true);

  await assert.rejects(() => platform.auth.refreshSession(), (error) => {
    assert.equal(error.code, "AUTH_SESSION_STALE");
    return true;
  });
  assert.equal(platform.auth.isSignedIn(), false);
  assert.equal(local.getItem(tlevelKey), "tlevel-session");
  assert.ok(sessionStore.getItem("learning-platform.pending-onboarding.v1:tlevel-software-development"));
  platform.destroy();
});

test("9/10: ET/T Level/Unit 3 stale recovery does not clear sibling hub sessions", async () => {
  const local = memoryStorage();
  const sessionStore = memoryStorage();
  const etKey = createAuthStorageKey(PROJECT_URL, "l2e-exploring-emerging-digital-technologies");
  const tlevelKey = createAuthStorageKey(PROJECT_URL, "tlevel-software-development");
  const cyberKey = createAuthStorageKey(PROJECT_URL, "unit-3-cyber-security");
  local.setItem(etKey, "et-session");
  local.setItem(tlevelKey, "tlevel-session");
  local.setItem(cyberKey, "cyber-session");

  const etClient = fakeSupabase({
    session: { access_token: "et-stale", user: { id: "deleted" } },
    authErrors: { getUser: DELETED_USER_ERROR }
  });
  const et = makePlatform(etClient, {
    hubCode: "l2e-exploring-emerging-digital-technologies",
    localStorage: local,
    sessionStorage: sessionStore
  });
  await et.initialise();
  assert.equal(et.auth.isSignedIn(), false);
  assert.equal(local.getItem(tlevelKey), "tlevel-session");
  assert.equal(local.getItem(cyberKey), "cyber-session");
  assert.ok(etClient.calls.some((call) => call.type === "sign-out" && call.options?.scope === "local"));
  et.destroy();

  const tlevelClient = fakeSupabase({
    session: { access_token: "tlevel-stale", user: { id: "deleted" } },
    authErrors: { getUser: DELETED_USER_ERROR }
  });
  const tlevel = makePlatform(tlevelClient, {
    hubCode: "tlevel-software-development",
    localStorage: local,
    sessionStorage: sessionStore
  });
  await tlevel.initialise();
  assert.equal(tlevel.auth.isSignedIn(), false);
  assert.equal(local.getItem(cyberKey), "cyber-session");
  assert.equal(local.getItem(etKey), "et-session");
  tlevel.destroy();
});

test("11: same-hub tabs converge to signed-out after stale recovery", async () => {
  const client = fakeSupabase({
    session: { access_token: "stale", user: { id: "deleted" } },
    authErrors: { getUser: DELETED_USER_ERROR }
  });
  const authA = createAuthService({ client });
  const authB = createAuthService({ client });
  const states = [];
  authA.subscribe((state) => states.push(["A", state.status]));
  authB.subscribe((state) => states.push(["B", state.status]));

  await authA.initialise();
  await authB.initialise();
  assert.equal(authA.getState().status, "signed-out");
  assert.equal(authB.getState().status, "signed-out");
  assert.equal(authA.isSignedIn(), false);
  assert.equal(authB.isSignedIn(), false);
});

test("12: stale recovery does not loop getUser/signOut on repeated initialise", async () => {
  const client = fakeSupabase({
    session: { access_token: "stale", user: { id: "deleted" } },
    authErrors: { getUser: DELETED_USER_ERROR }
  });
  const auth = createAuthService({ client });
  await auth.initialise();
  const getUserCount1 = client.calls.filter((call) => call.type === "get-user").length;
  const signOutCount1 = client.calls.filter((call) => call.type === "sign-out").length;
  assert.equal(getUserCount1, 1);
  assert.equal(signOutCount1, 1);

  // Second initialise is a no-op once initialised.
  await auth.initialise();
  assert.equal(client.calls.filter((call) => call.type === "get-user").length, 1);
  assert.equal(client.calls.filter((call) => call.type === "sign-out").length, 1);
});

test("empty my_profile alone is not classified as stale Auth", async () => {
  const client = fakeSupabase({
    session: { access_token: "valid", user: { id: "auth-user" } },
    views: { my_profile: [], my_enrolments: [] }
  });
  const auth = createAuthService({ client });
  const learner = learnerServices(client, auth);
  await auth.initialise();
  assert.equal(auth.isSignedIn(), true);
  await learner.refresh();
  assert.equal(learner.getState().status, "onboarding-required");
  assert.equal(auth.getState().error?.code !== "AUTH_SESSION_STALE", true);
});

test("refreshHubSession network failure keeps session and does not require sign-in", async () => {
  const client = fakeSupabase({
    session: { access_token: "a", user: { id: "auth-user" } },
    authErrors: {
      refreshSession: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }
    },
    views: {
      my_profile: [{ first_name: "Ada", surname: "Lovelace", student_number: "1" }],
      my_enrolments: [{ status: "active", group_code: "G" }]
    }
  });
  const platform = makePlatform(client);
  await platform.auth.initialise();
  const result = await platform.refreshHubSession();
  assert.equal(result.requiresSignIn, false);
  assert.equal(result.status, "error");
  assert.equal(platform.auth.isSignedIn(), true);
  assert.equal(client.calls.some((call) => call.type === "sign-out"), false);
  platform.destroy();
});
