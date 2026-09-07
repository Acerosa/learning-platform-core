import test from "node:test";
import assert from "node:assert/strict";
import { createAuthService } from "../../src/core/auth/auth-service.js";
import { createLearnerContext } from "../../src/core/learner/learner-context.js";
import { createProfileService } from "../../src/core/profile/profile-service.js";
import { createEnrolmentService } from "../../src/core/enrolment/enrolment-service.js";
import { createLearnerApi } from "../../src/core/api/learner-api.js";
import { createPlatform } from "../../src/platform.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";

function learnerServices(client, auth) {
  const api = createLearnerApi({ client });
  return createLearnerContext({
    authService: auth,
    profileService: createProfileService(api),
    enrolmentService: createEnrolmentService(api)
  });
}

test("failed password auth does not create a session or load learner context", async () => {
  const client = fakeSupabase({
    session: null,
    authErrors: { signIn: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } }
  });
  const auth = createAuthService({ client });
  const learner = learnerServices(client, auth);

  await assert.rejects(
    auth.signIn("learner@example.test", "wrong-password"),
    (error) => error.code === "invalid_credentials"
      && error.learnerMessage === "Email or password is incorrect."
  );
  assert.equal(auth.isSignedIn(), false);
  assert.equal(auth.getSession(), null);
  assert.equal(learner.getState().status, "signed-out");
  assert.equal(learner.getContext(), null);
  assert.equal(client.calls.some((call) => call.type === "view"), false);
});

test("auth success with profile 401 keeps the session and is not invalid_credentials", async () => {
  const client = fakeSupabase({
    session: null,
    viewErrors: {
      my_profile: { code: "PGRST301", message: "JWT expired", status: 401 }
    }
  });
  const auth = createAuthService({ client });
  const learner = learnerServices(client, auth);

  await auth.signIn("learner@example.test", "password-123");
  assert.equal(auth.isSignedIn(), true);
  assert.equal(Boolean(auth.getSession()), true);

  await assert.rejects(learner.refresh(), (error) => {
    assert.notEqual(String(error.code).toLowerCase(), "invalid_credentials");
    assert.notEqual(error.learnerMessage, "Email or password is incorrect.");
    assert.equal(error.learnerMessage.includes("JWT"), false);
    assert.equal(error.diagnostic.operation, "load-learner-context");
    return true;
  });
  assert.equal(auth.isSignedIn(), true);
  assert.equal(Boolean(auth.getSession()), true);
  assert.equal(learner.getState().status, "error");
});

test("auth success with profile 500 keeps the session and hides internals", async () => {
  const client = fakeSupabase({
    session: null,
    viewErrors: {
      my_profile: { code: "PGRST000", message: "database host internal", status: 500 }
    }
  });
  const auth = createAuthService({ client });
  const learner = learnerServices(client, auth);

  await auth.signIn("learner@example.test", "password-123");
  await assert.rejects(learner.refresh(), (error) => {
    assert.notEqual(String(error.code).toLowerCase(), "invalid_credentials");
    assert.equal(error.learnerMessage.includes("database host internal"), false);
    return true;
  });
  assert.equal(auth.isSignedIn(), true);
  assert.equal(learner.getState().status, "error");
});

test("auth success with enrolment failure keeps the session and is not invalid_credentials", async () => {
  const client = fakeSupabase({
    session: null,
    views: {
      my_profile: [{ student_number: "000123", first_name: "Ada", surname: "Lovelace" }]
    },
    viewErrors: {
      my_enrolments: { code: "42501", message: "permission denied for table enrolments", status: 403 }
    }
  });
  const auth = createAuthService({ client });
  const learner = learnerServices(client, auth);

  await auth.signIn("learner@example.test", "password-123");
  await assert.rejects(learner.refresh(), (error) => {
    assert.notEqual(String(error.code).toLowerCase(), "invalid_credentials");
    assert.equal(error.learnerMessage.includes("permission denied"), false);
    assert.equal(error.diagnostic.operation, "load-learner-context");
    return true;
  });
  assert.equal(auth.isSignedIn(), true);
  assert.equal(learner.getState().status, "error");
});

test("sign-out clears the session without calling learner APIs", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed-by-supabase", user: { id: "auth-user" } }
  });
  const auth = createAuthService({ client });
  await auth.initialise();
  assert.equal(auth.isSignedIn(), true);
  await auth.signOut();
  assert.equal(auth.isSignedIn(), false);
  assert.equal(auth.getSession(), null);
  assert.equal(client.calls.some((call) => call.type === "view"), false);
});

test("restored session still keeps Auth when learner context fails to load", async () => {
  const client = fakeSupabase({
    session: { access_token: "restored-access-token", user: { id: "auth-user" } },
    viewErrors: {
      my_profile: { code: "PGRST301", message: "JWT expired", status: 401 }
    }
  });
  const platform = createPlatform({
    hubCode: "test-hub",
    hubName: "Test Hub"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });

  await assert.rejects(platform.initialise(), (error) => {
    assert.notEqual(String(error.code).toLowerCase(), "invalid_credentials");
    assert.equal(error.learnerMessage.includes("JWT"), false);
    return true;
  });
  assert.equal(platform.auth.isSignedIn(), true);
  assert.equal(Boolean(platform.auth.getSession()), true);
  assert.equal(platform.learner.getState().status, "error");
  assert.notEqual(platform.state.getState().status, "signed-out");
  platform.destroy();
});
