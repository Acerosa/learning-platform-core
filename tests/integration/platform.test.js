import test from "node:test";
import assert from "node:assert/strict";
import { createPlatform } from "../../src/platform.js";
import { evidence } from "../../src/core/evidence/evidence.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";

test("platform composes auth, learner context, assignments, progress and submission", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "000123", first_name: "Ada", surname: "Lovelace", contact_email: "ada@example.test" }],
      my_enrolments: [{ status: "active", group_code: "A", year_group: "Year 1" }],
      my_assignments: [{ activity_key: "activity-1" }],
      my_activity_progress: [{ activity_key: "activity-1", completed: true }]
    },
    rpcs: {
      submit_attempt: (payload) => [{ client_attempt_id: payload.p_client_attempt_id, idempotent: false }]
    }
  });
  const platform = createPlatform({
    hubCode: "test-hub",
    hubName: "Test Hub",
    navigation: [{ id: "home", path: "./" }]
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000003" },
    document: null,
    window: null
  });
  await platform.initialise();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(platform.state.getState().status, "ready");
  assert.equal(platform.learner.getContext().fullName, "Ada Lovelace");
  assert.deepEqual(await platform.assignments.getAssignments(), [{ activity_key: "activity-1" }]);
  assert.deepEqual(await platform.progress.getProgress("activity-1"), [{ activity_key: "activity-1", completed: true }]);
  const result = await platform.submission.submit({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    responses: [evidence.written("q1", "answer")]
  });
  assert.equal(result[0].idempotent, false);
  const rpc = client.calls.find((call) => call.type === "rpc" && call.name === "submit_attempt");
  assert.deepEqual(Object.keys(rpc.payload), [
    "p_activity_key", "p_activity_version", "p_client_attempt_id", "p_responses",
    "p_source_page", "p_started_at", "p_completed_at", "p_programming_language"
  ]);
  platform.destroy();
});

test("platform submission rejects signed-out users", async () => {
  const client = fakeSupabase();
  const platform = createPlatform({
    hubCode: "test-hub",
    hubName: "Test Hub"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await assert.rejects(
    platform.submission.submit({
      activityKey: "activity-1",
      activityVersion: "1.0.0",
      responses: [evidence.written("q1", "answer")]
    }),
    (error) => error.code === "AUTH_REQUIRED"
  );
  platform.destroy();
});

test("platform reports onboarding-required when the authenticated profile is absent", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed" },
    views: { my_profile: [], my_enrolments: [] }
  });
  const platform = createPlatform({ hubCode: "test-hub", hubName: "Test Hub" }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  assert.equal(platform.state.getState().status, "onboarding-required");
  platform.destroy();
});
