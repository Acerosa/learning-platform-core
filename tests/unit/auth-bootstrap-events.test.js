import test from "node:test";
import assert from "node:assert/strict";
import { createPlatform } from "../../src/platform.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";

function applicationReads(calls) {
  return calls.filter((call) => (
    (call.type === "rpc" && [
      "ensure_learner_auth_link",
      "resolve_learner_hub_access",
      "my_hub_assignments",
      "published_curriculum",
      "published_curriculum_package",
      "get_activity_state"
    ].includes(call.name))
    || (call.type === "view" && [
      "my_profile",
      "my_enrolments",
      "my_activity_progress",
      "my_assignments"
    ].includes(call.view))
  ));
}

function enrolledClient(session = { access_token: "managed", user: { id: "auth-user" } }) {
  return fakeSupabase({
    session,
    views: {
      my_profile: [{ student_number: "000123", first_name: "Ada", surname: "Lovelace", contact_email: "ada@example.test" }],
      my_enrolments: [{ status: "active", group_code: "A", year_group: "Year 1" }]
    },
    rpcs: {
      ensure_learner_auth_link: [{}],
      resolve_learner_hub_access: [{ status: "enrolled", group_code: "A", year_group: "Year 1" }],
      my_hub_assignments: [{ activity_key: "activity-1" }]
    }
  });
}

function makePlatform(client) {
  return createPlatform({
    hubCode: "test-hub",
    hubName: "Test Hub",
    courseKey: "test-course",
    navigation: [{ id: "home", path: "./" }]
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    localStorage: memoryStorage(),
    document: null,
    window: null
  });
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("page refresh / initialise bootstraps learner data once", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await settle();
  const afterInit = applicationReads(client.calls).length;
  assert.equal(platform.auth.getState().status, "authenticated");
  assert.equal(platform.learner.getState().status, "authenticated");
  assert.ok(afterInit >= 4);
  client.emitAuthEvent("INITIAL_SESSION", {
    access_token: "managed",
    user: { id: "auth-user" }
  });
  await settle();
  assert.equal(applicationReads(client.calls).length, afterInit);
  platform.destroy();
});

test("TOKEN_REFRESHED rotates the JWT without repeating application reads", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await settle();
  const before = applicationReads(client.calls).length;
  const refreshed = {
    access_token: "rotated-access-token",
    user: { id: "auth-user" }
  };
  client.emitAuthEvent("TOKEN_REFRESHED", refreshed);
  await settle();
  assert.equal(platform.auth.getSession()?.access_token, "rotated-access-token");
  assert.equal(platform.auth.isSignedIn(), true);
  assert.equal(platform.learner.getState().status, "authenticated");
  assert.equal(applicationReads(client.calls).length, before);
  assert.equal(platform.state.getState().status, "ready");
  platform.destroy();
});

test("SIGNED_IN after logout bootstraps again for the same user", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await settle();
  await platform.auth.signOut();
  await settle();
  const afterSignOut = applicationReads(client.calls).length;
  assert.equal(platform.auth.getState().status, "signed-out");
  await platform.auth.signIn("ada@example.test", "secret");
  await settle();
  assert.equal(platform.auth.isSignedIn(), true);
  assert.equal(platform.learner.getState().status, "authenticated");
  assert.ok(applicationReads(client.calls).length > afterSignOut);
  platform.destroy();
});

test("switching authenticated users bootstraps the new session", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await settle();
  const before = applicationReads(client.calls).length;
  client.emitAuthEvent("SIGNED_IN", {
    access_token: "other-user-token",
    user: { id: "other-user" }
  });
  await settle();
  assert.equal(platform.auth.getSession()?.user?.id, "other-user");
  assert.ok(applicationReads(client.calls).length > before);
  platform.destroy();
});

test("expired session SIGNED_OUT clears learner data and does not reload hub reads", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await settle();
  const before = applicationReads(client.calls).length;
  client.emitAuthEvent("SIGNED_OUT", null);
  await settle();
  assert.equal(platform.auth.isSignedIn(), false);
  assert.equal(platform.learner.getState().status, "signed-out");
  assert.equal(applicationReads(client.calls).length, before);
  platform.destroy();
});

test("TOKEN_REFRESHED before count is 5 application reads and after is 0 extra", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await settle();
  const names = applicationReads(client.calls).map((call) => call.name || call.view);
  assert.ok(names.includes("ensure_learner_auth_link"));
  assert.ok(names.includes("my_profile"));
  assert.ok(names.includes("my_enrolments"));
  assert.ok(names.includes("resolve_learner_hub_access"));
  assert.ok(names.includes("my_hub_assignments"));
  const before = applicationReads(client.calls).length;
  client.emitAuthEvent("TOKEN_REFRESHED", {
    access_token: "next",
    user: { id: "auth-user" }
  });
  await settle();
  assert.equal(applicationReads(client.calls).length - before, 0);
  platform.destroy();
});
