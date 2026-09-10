import test from "node:test";
import assert from "node:assert/strict";
import { createPlatform } from "../../src/platform.js";
import { createAuthStorageKey } from "../../src/core/auth/auth-storage-key.js";
import { memoryStorage } from "../helpers.js";

const PROJECT_URL = "https://hubwpkrqndorznwzvaer.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_contract-public-key";

function createSessionClient({ refreshOk = true, session = { access_token: "a", refresh_token: "r" } } = {}) {
  let current = session;
  const calls = [];
  return {
    calls,
    auth: {
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession() {
        return Promise.resolve({ data: { session: current }, error: null });
      },
      async refreshSession() {
        calls.push("refreshSession");
        if (!refreshOk) {
          return { data: { session: null }, error: { message: "Invalid Refresh Token" } };
        }
        current = { access_token: "a2", refresh_token: "r2" };
        return { data: { session: current }, error: null };
      },
      async signOut(options) {
        calls.push(["signOut", options]);
        current = null;
        return { error: null };
      },
      signInWithPassword() {
        return Promise.resolve({ data: { session: current }, error: null });
      },
      signUp() {
        return Promise.resolve({ data: { session: null, user: null }, error: null });
      }
    },
    schema() {
      return {
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            order() { return this; },
            then(resolve) {
              return Promise.resolve({ data: [], error: null }).then(resolve);
            }
          };
        },
        rpc(name, args) {
          calls.push(["rpc", name, args]);
          if (name === "resolve_learner_hub_access") {
            return Promise.resolve({
              data: [{
                status: "enrolled",
                idempotent: true,
                group_code: "CYBER-TEST-A",
                group_name: "Cyber",
                enrolment_status: "active"
              }],
              error: null
            });
          }
          if (name === "my_hub_assignments") {
            return Promise.resolve({
              data: [{ activity_key: "demo", activity_version: "1.0.0" }],
              error: null
            });
          }
          if (name === "my_profile") {
            return Promise.resolve({
              data: [{
                first_name: "Ada",
                surname: "Lovelace",
                student_number: "123456",
                group_code: "CYBER-TEST-A"
              }],
              error: null
            });
          }
          if (name === "my_enrolments") {
            return Promise.resolve({
              data: [{ status: "active", group_code: "CYBER-TEST-A" }],
              error: null
            });
          }
          return Promise.resolve({ data: [], error: null });
        }
      };
    }
  };
}

function makePlatform(client, localStorage, sessionStorage) {
  return createPlatform({
    hubCode: "unit-3-cyber-security",
    courseKey: "ocr-level-3-it",
    hubName: "Unit 3",
    supabase: {
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY
    }
  }, {
    supabaseClient: client,
    localStorage,
    sessionStorage,
    document: null,
    window: null
  });
}

test("refreshHubSession refreshes tokens and reloads hub access for the current hub only", async () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const cyberKey = createAuthStorageKey(PROJECT_URL, "unit-3-cyber-security");
  const tlevelKey = createAuthStorageKey(PROJECT_URL, "tlevel-software-development");
  local.setItem(cyberKey, "cyber-session");
  local.setItem(tlevelKey, "tlevel-session");
  session.setItem("learning-platform.pending-onboarding.v1:unit-3-cyber-security", "{}");
  session.setItem("learning-platform.pending-onboarding.v1:tlevel-software-development", "{}");

  const client = createSessionClient();
  const platform = makePlatform(client, local, session);
  await platform.auth.initialise();
  assert.equal(platform.auth.isSignedIn(), true);

  const result = await platform.refreshHubSession();
  assert.equal(result.ok, true);
  assert.equal(result.requiresSignIn, false);
  assert.ok(client.calls.includes("refreshSession"));
  assert.equal(local.getItem(tlevelKey), "tlevel-session");
  assert.ok(session.getItem("learning-platform.pending-onboarding.v1:tlevel-software-development"));
  platform.destroy();
});

test("refreshHubSession falls back to local sign-out when refresh fails", async () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const cyberKey = createAuthStorageKey(PROJECT_URL, "unit-3-cyber-security");
  const tlevelKey = createAuthStorageKey(PROJECT_URL, "tlevel-software-development");
  local.setItem(cyberKey, "cyber-session");
  local.setItem(tlevelKey, "tlevel-session");
  session.setItem(
    "learning-platform.pending-onboarding.v1:unit-3-cyber-security",
    JSON.stringify({ firstName: "A", surname: "B", studentNumber: "1" })
  );
  session.setItem(
    "learning-platform.pending-onboarding.v1:tlevel-software-development",
    JSON.stringify({ firstName: "Keep", surname: "T", studentNumber: "2" })
  );

  const client = createSessionClient({ refreshOk: false });
  // Bypass initialise getSession signed-in path by publishing via a successful init then fail refresh.
  // Seed signed-in: initialise with session present.
  const platform = makePlatform(client, local, session);
  await platform.auth.initialise();

  const result = await platform.refreshHubSession();
  assert.equal(result.ok, false);
  assert.equal(result.requiresSignIn, true);
  assert.match(result.learnerMessage, /session needs to be refreshed/i);
  assert.equal(platform.auth.isSignedIn(), false);
  assert.equal(local.getItem(tlevelKey), "tlevel-session");
  assert.ok(session.getItem("learning-platform.pending-onboarding.v1:tlevel-software-development"));
  assert.equal(
    session.getItem("learning-platform.pending-onboarding.v1:unit-3-cyber-security"),
    null
  );
  const signOut = client.calls.find((call) => Array.isArray(call) && call[0] === "signOut");
  assert.deepEqual(signOut, ["signOut", { scope: "local" }]);
  platform.destroy();
});
