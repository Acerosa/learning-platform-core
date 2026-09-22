import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPlatform } from "../../src/platform.js";
import { evidence } from "../../src/core/evidence/evidence.js";
import {
  resetPlatformRequests,
  snapshotPlatformRequests,
  categorizePlatformRequest
} from "../../src/core/logging/request-counter.js";
import { resetActivityStateDedupe } from "../../src/core/progress/activity-state.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";

beforeEach(() => {
  resetPlatformRequests();
  resetActivityStateDedupe();
});

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function counts() {
  return snapshotPlatformRequests().counts;
}

function operations() {
  return snapshotPlatformRequests().operations;
}

function attachRealtime(client) {
  const channels = [];
  client.channel = (topic, config) => {
    const channel = {
      topic,
      config,
      on() { return channel; },
      subscribe(cb) {
        queueMicrotask(() => cb?.("SUBSCRIBED"));
        return channel;
      },
      unsubscribe: async () => {}
    };
    channels.push(channel);
    return channel;
  };
  client.removeChannel = async () => {};
  return client;
}

function enrolledClient() {
  return attachRealtime(fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "000123", first_name: "Ada", surname: "Lovelace", contact_email: "ada@example.test" }],
      my_enrolments: [{ status: "active", group_code: "A", year_group: "Year 1" }],
      my_activity_progress: [{ activity_key: "week-1-a", completed: true }]
    },
    rpcs: {
      ensure_learner_auth_link: [{}],
      resolve_learner_hub_access: [{ status: "enrolled", group_code: "A", year_group: "Year 1" }],
      my_hub_assignments: [{ activity_key: "week-1-a" }],
      published_curriculum: [{
        hub_code: "test-hub",
        course_key: "test-course",
        package_version: "0.2.0",
        schema_version: "0.1.0",
        source_package_version: "0.1.0",
        published_at: "2026-09-21T12:00:00Z"
      }],
      published_curriculum_package: [{
        hub_code: "test-hub",
        course_key: "test-course",
        package_version: "0.2.0",
        schema_version: "0.1.0",
        source_package_version: "0.1.0",
        published_at: "2026-09-21T12:00:00Z",
        package: {
          schema: "lp.content.package",
          schemaVersion: "0.1.0",
          id: "test-hub-content",
          version: "0.2.0",
          hub: { id: "test-hub" },
          curriculum: { metadata: { course: "test-course" } }
        }
      }],
      get_activity_state: [],
      save_activity_state: (payload) => [{
        activity_key: payload.p_activity_key,
        activity_version: payload.p_activity_version,
        status: "in_progress",
        state: payload.p_state,
        updated_at: payload.p_client_updated_at,
        revision: 1
      }],
      submit_attempt: (payload) => [{ client_attempt_id: payload.p_client_attempt_id, idempotent: false }]
    }
  }));
}

function makePlatform(client, extra = {}) {
  return createPlatform({
    hubCode: "test-hub",
    hubName: "Test Hub",
    courseKey: "test-course",
    navigation: [{ id: "home", path: "./" }]
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    localStorage: extra.localStorage || memoryStorage(),
    document: null,
    window: null,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000003" }
  });
}

test("request counters store operation names only", () => {
  assert.equal(categorizePlatformRequest("rpc", "save_activity_state"), "SAVE_ACTIVITY_STATE");
  assert.equal(categorizePlatformRequest("rpc", "list_hub_learning_results"), "ADMIN");
  const snap = snapshotPlatformRequests();
  assert.equal("payload" in snap.counts, false);
  snap.operations.forEach((entry) => {
    assert.equal(Object.keys(entry).sort().join(","), "category,kind,operation");
  });
});

test("SCENARIO A: login/restore hub then open a 5-activity week", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await wait(0);
  await platform.curriculum.loadLatest();
  await Promise.all(["a", "b", "c", "d", "e"].map((id) => (
    platform.progress.createStore({
      activityKey: `week-1-${id}`,
      activityVersion: "1.0.0",
      storage: memoryStorage()
    }).hydrate()
  )));
  const result = counts();
  assert.equal(result.AUTH_BOOTSTRAP, 5);
  assert.equal(result.ASSIGNMENTS, 1);
  assert.equal(result.CURRICULUM, 1);
  assert.equal(result.GET_ACTIVITY_STATE, 5);
  assert.equal(result.SAVE_ACTIVITY_STATE, 0);
  assert.equal(result.SUBMIT_ATTEMPT, 0);
  assert.ok(result.REALTIME >= 1);
  platform.destroy();
});

test("SCENARIO B: open activity, edit, pause, edit, Check, next activity", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await wait(0);
  resetPlatformRequests();
  const first = platform.progress.createStore({
    activityKey: "week-1-a",
    activityVersion: "1.0.0",
    storage: memoryStorage(),
    debounceMs: 20
  });
  await first.hydrate();
  first.save({ responses: { Q1: "a" } });
  await wait(40);
  first.save({ responses: { Q1: "ab" } });
  await wait(40);
  first.save({ responses: { Q1: "ab" }, checked: { Q1: true } }, { immediate: true });
  const next = platform.progress.createStore({
    activityKey: "week-1-b",
    activityVersion: "1.0.0",
    storage: memoryStorage(),
    debounceMs: 20
  });
  await next.hydrate();
  const result = counts();
  assert.equal(result.GET_ACTIVITY_STATE, 2);
  assert.equal(result.SAVE_ACTIVITY_STATE, 3);
  assert.equal(result.SUBMIT_ATTEMPT, 0);
  assert.equal(result.AUTH_BOOTSTRAP, 0);
  platform.destroy();
});

test("SCENARIO C: Finish submits one official attempt", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await wait(0);
  resetPlatformRequests();
  const store = platform.progress.createStore({
    activityKey: "week-1-a",
    activityVersion: "1.0.0",
    storage: memoryStorage()
  });
  await store.hydrate();
  store.save({ responses: { Q1: "done" }, checked: { Q1: true } }, { immediate: true });
  await platform.submission.submit({
    activityKey: "week-1-a",
    activityVersion: "1.0.0",
    responses: [evidence.written("q1", "answer")]
  });
  const result = counts();
  assert.equal(result.GET_ACTIVITY_STATE, 1);
  assert.equal(result.SAVE_ACTIVITY_STATE, 1);
  assert.equal(result.SUBMIT_ATTEMPT, 1);
  platform.destroy();
});

test("SCENARIO D: TOKEN_REFRESHED adds no application REST", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await wait(0);
  resetPlatformRequests();
  client.emitAuthEvent("TOKEN_REFRESHED", {
    access_token: "rotated",
    user: { id: "auth-user" }
  });
  await wait(0);
  const result = counts();
  assert.equal(result.AUTH_BOOTSTRAP, 0);
  assert.equal(result.ASSIGNMENTS, 0);
  assert.equal(result.CURRICULUM, 0);
  assert.equal(result.GET_ACTIVITY_STATE, 0);
  assert.equal(result.PROGRESS, 0);
  assert.equal(result.REALTIME, 1);
  assert.equal(operations()[0].operation, "setAuth");
  platform.destroy();
});

test("SCENARIO E: reload with unchanged curriculum uses metadata only", async () => {
  const storage = memoryStorage();
  const client = enrolledClient();
  const first = makePlatform(client, { localStorage: storage });
  await first.initialise();
  await wait(0);
  await first.curriculum.loadLatest();
  first.destroy();
  resetPlatformRequests();
  const second = makePlatform(enrolledClient(), { localStorage: storage });
  const loaded = await second.curriculum.loadLatest();
  assert.equal(loaded.package.version, "0.2.0");
  const result = counts();
  assert.equal(result.CURRICULUM, 1);
  assert.deepEqual(operations().map((entry) => entry.operation), ["published_curriculum"]);
  second.destroy();
});

test("SCENARIO F admin Hub Learning filter RPCs are view-only after the hub list", () => {
  assert.equal(categorizePlatformRequest("rpc", "list_hub_learning_result_filters"), "ADMIN");
  assert.equal(categorizePlatformRequest("rpc", "list_hub_learning_results"), "ADMIN");
  assert.equal(categorizePlatformRequest("rpc", "summarise_hub_learning_results"), "ADMIN");
});

test("GUARDRAIL: TOKEN_REFRESHED application REST is 0", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await wait(0);
  resetPlatformRequests();
  client.emitAuthEvent("TOKEN_REFRESHED", {
    access_token: "rotated",
    user: { id: "auth-user" }
  });
  await wait(0);
  const result = counts();
  assert.equal(result.AUTH_BOOTSTRAP, 0);
  assert.equal(result.ASSIGNMENTS, 0);
  assert.equal(result.CURRICULUM, 0);
  assert.equal(result.GET_ACTIVITY_STATE, 0);
  assert.equal(result.SAVE_ACTIVITY_STATE, 0);
  assert.equal(result.SUBMIT_ATTEMPT, 0);
  assert.equal(result.PROGRESS, 0);
  assert.equal(result.ADMIN, 0);
  assert.equal(result.REALTIME, 1);
  platform.destroy();
});

test("GUARDRAIL: week rerender additional get_activity_state is 0", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await wait(0);
  const storage = memoryStorage();
  const keys = ["a", "b", "c", "d", "e"];
  await Promise.all(keys.map((id) => (
    platform.progress.createStore({
      activityKey: `week-1-${id}`,
      activityVersion: "1.0.0",
      storage
    }).hydrate()
  )));
  resetPlatformRequests();
  await Promise.all(keys.map((id) => (
    platform.progress.createStore({
      activityKey: `week-1-${id}`,
      activityVersion: "1.0.0",
      storage
    }).hydrate()
  )));
  const result = counts();
  assert.equal(result.GET_ACTIVITY_STATE, 0);
  assert.equal(result.SAVE_ACTIVITY_STATE, 0);
  platform.destroy();
});

test("GUARDRAIL: same unchanged draft additional save is 0", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await wait(0);
  const store = platform.progress.createStore({
    activityKey: "week-1-a",
    activityVersion: "1.0.0",
    storage: memoryStorage(),
    debounceMs: 20
  });
  await store.hydrate();
  store.save({ responses: { Q1: "same" } }, { immediate: true });
  await wait(40);
  resetPlatformRequests();
  store.save({ responses: { Q1: "same" } }, { immediate: true });
  store.save({ responses: { Q1: "same" } });
  await wait(40);
  const result = counts();
  assert.equal(result.SAVE_ACTIVITY_STATE, 0);
  assert.equal(result.GET_ACTIVITY_STATE, 0);
  platform.destroy();
});

test("GUARDRAIL: trailing debounce coalesces rapid typing to one save", async () => {
  const client = enrolledClient();
  const platform = makePlatform(client);
  await platform.initialise();
  await wait(0);
  resetPlatformRequests();
  const store = platform.progress.createStore({
    activityKey: "week-1-a",
    activityVersion: "1.0.0",
    storage: memoryStorage(),
    debounceMs: 30
  });
  await store.hydrate();
  resetPlatformRequests();
  for (let i = 1; i <= 40; i += 1) {
    store.save({ responses: { Q1: "x".repeat(i) } });
  }
  assert.equal(counts().SAVE_ACTIVITY_STATE, 0);
  await wait(60);
  const result = counts();
  assert.equal(result.SAVE_ACTIVITY_STATE, 1);
  assert.equal(result.GET_ACTIVITY_STATE, 0);
  platform.destroy();
});
