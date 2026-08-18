import test from "node:test";
import assert from "node:assert/strict";
import { createLearnerApi } from "../../src/core/api/learner-api.js";
import { createProgressService } from "../../src/core/progress/progress-service.js";
import { fakeSupabase } from "../helpers.js";

test("learner API selects only the approved api schema", async () => {
  const client = fakeSupabase({
    views: {
      my_profile: [{ first_name: "Ada" }],
      my_enrolments: [{ group_code: "A" }],
      my_assignments: [{ activity_key: "a" }]
    }
  });
  const api = createLearnerApi({ client });
  await api.getProfile();
  await api.getEnrolments();
  await api.getAssignments();
  assert.deepEqual(client.calls.filter((call) => call.type === "schema").map((call) => call.name), ["api"]);
  assert.deepEqual(client.calls.filter((call) => call.type === "view").map((call) => call.view), ["my_profile", "my_enrolments", "my_assignments"]);
});

test("learner API exposes profile, enrolment, assignment, delivery, attempts, responses and progress contracts", () => {
  const api = createLearnerApi({ client: fakeSupabase() });
  for (const method of ["getProfile", "getEnrolments", "getAssignments", "getCurriculumDelivery", "getAttempts", "getResponses", "getProgress", "getRegistrationOptions", "completeOnboarding", "submitAttempt", "getPublishedCurriculum", "getPublishedCurriculumPackage"]) {
    assert.equal(typeof api[method], "function", method);
  }
});

test("published curriculum package reads use the learner-safe RPC", async () => {
  const client = fakeSupabase({
    rpcs: {
      published_curriculum_package: [{ package_version: "0.2.0", package: { version: "0.2.0" } }]
    }
  });
  const api = createLearnerApi({ client });
  const rows = await api.getPublishedCurriculumPackage("example-hub", "example-course");
  assert.equal(rows[0].package_version, "0.2.0");
  assert.deepEqual(
    client.calls.filter((call) => call.type === "rpc").map((call) => call.name),
    ["published_curriculum_package"]
  );
  assert.deepEqual(client.calls.find((call) => call.type === "rpc").payload, {
    p_hub_code: "example-hub",
    p_course_key: "example-course"
  });
  await api.getPublishedCurriculumPackage("example-hub", "example-course", "0.2.1");
  assert.deepEqual(client.calls.filter((call) => call.type === "rpc").at(-1).payload, {
    p_hub_code: "example-hub",
    p_course_key: "example-course",
    p_package_version: "0.2.1"
  });
});

test("progress service obtains authoritative progress from the API", async () => {
  const calls = [];
  const progress = createProgressService({
    getProgress: async (key) => { calls.push(["progress", key]); return [{ completion: 100 }]; },
    getAttempts: async (key) => { calls.push(["attempts", key]); return []; },
    getResponses: async (key) => { calls.push(["responses", key]); return []; }
  });
  assert.deepEqual(await progress.getProgress("a"), [{ completion: 100 }]);
  await progress.getAttempts("a");
  await progress.getResponses("a");
  assert.deepEqual(calls, [["progress", "a"], ["attempts", "a"], ["responses", "a"]]);
});
