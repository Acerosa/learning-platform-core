import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { memoryStorage } from "../helpers.js";
import {
  createActivityStateStore,
  persistableActivityStateFingerprint,
  resetActivityStateDedupe
} from "../../src/core/progress/activity-state.js";

beforeEach(() => {
  resetActivityStateDedupe();
});

function signedInAuth(userId = "auth-user") {
  return {
    isSignedIn: () => true,
    getSession: () => ({ user: { id: userId } })
  };
}

function countingApi(options = {}) {
  const reads = [];
  const saves = [];
  let failNextRead = Boolean(options.failNextRead);
  let failNextSave = Boolean(options.failNextSave);
  const api = {
    reads,
    saves,
    getActivityState: async (payload) => {
      reads.push(payload);
      if (failNextRead) {
        failNextRead = false;
        throw new Error("read-failed");
      }
      if (typeof options.read === "function") return options.read(payload);
      return options.read === undefined ? [] : options.read;
    },
    saveActivityState: async (payload) => {
      saves.push(payload);
      if (failNextSave) {
        failNextSave = false;
        throw new Error("save-failed");
      }
      return [{ state: payload.state, updated_at: payload.clientUpdatedAt }];
    }
  };
  return api;
}

function storeFor(api, extras = {}) {
  return createActivityStateStore({
    api,
    auth: extras.auth || signedInAuth(extras.userId),
    storage: extras.storage || memoryStorage(),
    activityKey: extras.activityKey || "week-1-activity",
    activityVersion: extras.activityVersion || "1.0.0"
  });
}

test("A. a single activity hydrates from the server exactly once", async () => {
  const api = countingApi();
  const store = storeFor(api);
  await store.hydrate();
  await store.hydrate();
  await store.hydrate();
  assert.equal(api.reads.length, 1);
});

test("B/C. unrelated rerender hydrates do not issue extra reads", async () => {
  const api = countingApi();
  const store = storeFor(api);
  await store.hydrate();
  for (let index = 0; index < 50; index += 1) {
    await storeFor(api).hydrate();
  }
  assert.equal(api.reads.length, 1);
});

test("D. twenty-eight activities hydrate once each, not once per rerender", async () => {
  const api = countingApi();
  const auth = signedInAuth();
  const activities = Array.from({ length: 28 }, (_, index) => `activity-${index + 1}`);
  async function hydrateAll() {
    await Promise.all(activities.map((activityKey) => storeFor(api, { auth, activityKey }).hydrate()));
  }
  await hydrateAll();
  for (let wave = 0; wave < 200; wave += 1) {
    await hydrateAll();
  }
  assert.equal(api.reads.length, 28);
});

test("E. concurrent hydrates of the same activity share one request", async () => {
  let current = 0;
  let max = 0;
  const api = countingApi({
    read: async () => {
      current += 1;
      max = Math.max(max, current);
      await new Promise((resolve) => setTimeout(resolve, 20));
      current -= 1;
      return [];
    }
  });
  await Promise.all(Array.from({ length: 12 }, () => storeFor(api).hydrate()));
  assert.equal(api.reads.length, 1);
  assert.equal(max, 1);
});

test("F. a failed read is not cached and can be retried", async () => {
  const api = countingApi({ failNextRead: true });
  const store = storeFor(api, { storage: memoryStorage() });
  store.save({ responses: { Q1: "kept" } }, { remote: false });
  const first = await store.hydrate();
  assert.equal(first.responses.Q1, "kept");
  const second = await store.hydrate();
  assert.equal(api.reads.length, 2);
  assert.equal(second.responses.Q1, "kept");
});

test("G. a new activity or version hydrates normally", async () => {
  const api = countingApi();
  await storeFor(api, { activityKey: "alpha", activityVersion: "1.0.0" }).hydrate();
  await storeFor(api, { activityKey: "beta", activityVersion: "1.0.0" }).hydrate();
  await storeFor(api, { activityKey: "alpha", activityVersion: "2.0.0" }).hydrate();
  assert.equal(api.reads.length, 3);
});

test("logout / guest scope does not keep a previous learner's write fingerprint", async () => {
  const api = countingApi();
  const storage = memoryStorage();
  const signedIn = storeFor(api, { userId: "learner-a", storage });
  signedIn.save({ responses: { Q1: "A" } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const guest = createActivityStateStore({
    api,
    auth: { isSignedIn: () => false, getSession: () => null },
    storage,
    activityKey: "week-1-activity",
    activityVersion: "1.0.0"
  });
  guest.save({ responses: { Q1: "A" } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const signedInAgain = storeFor(api, { userId: "learner-b", storage: memoryStorage() });
  signedInAgain.save({ responses: { Q1: "A" } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.saves.length, 2);
});

test("H. cached reads cannot leak across learners", async () => {
  const api = countingApi({
    read: async () => [{ state: { responses: { Q1: "secret" } }, updated_at: "2026-09-12T08:00:00.000Z" }]
  });
  const first = await storeFor(api, { userId: "learner-a" }).hydrate();
  const second = await storeFor(api, { userId: "learner-b", storage: memoryStorage() }).hydrate();
  assert.equal(api.reads.length, 2);
  assert.equal(first.responses.Q1, "secret");
  assert.equal(second.responses.Q1, "secret");
});

test("I. explicit fresh hydrate bypasses the session read guard", async () => {
  const api = countingApi({
    read: async () => [{ state: { responses: { Q1: "server" } }, updated_at: "2026-09-12T08:00:00.000Z" }]
  });
  const store = storeFor(api);
  await store.hydrate();
  await store.hydrate();
  await store.hydrate(null, { fresh: true });
  assert.equal(api.reads.length, 2);
});

test("J. unchanged drafts do not write twice", async () => {
  const api = countingApi();
  const store = storeFor(api);
  store.save({ responses: { Q1: "A" }, checked: { Q1: true } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  store.save({ responses: { Q1: "A" }, checked: { Q1: true } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.saves.length, 1);
});

test("K. a changed draft still writes", async () => {
  const api = countingApi();
  const store = storeFor(api);
  store.save({ responses: { Q1: "A" }, checked: { Q1: false } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  store.save({ responses: { Q1: "B" }, checked: { Q1: false } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.saves.length, 2);
  assert.equal(api.saves[1].state.responses.Q1, "B");
});

test("L. a failed save remains retryable for the same payload", async () => {
  const api = countingApi({ failNextSave: true });
  const store = storeFor(api);
  store.save({ responses: { Q1: "retry" } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  store.save({ responses: { Q1: "retry" } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.saves.length, 2);
});

test("M. Try Again / reset still persists the cleared checked flag", async () => {
  const api = countingApi();
  const store = storeFor(api);
  store.save({ responses: { Q1: "A" }, checked: { Q1: true } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  store.save({ responses: { Q1: "A" }, checked: { Q1: false } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.saves.length, 2);
  assert.equal(api.saves[1].state.checked.Q1, false);
});

test("N. checked result persistence is not treated as an unchanged write", async () => {
  const api = countingApi();
  const store = storeFor(api);
  store.save({ responses: { Q1: "C" }, checked: {} }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  store.save({
    responses: { Q1: "C" },
    checked: { Q1: true },
    results: { Q1: { correct: true, status: "correct" } }
  }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.saves.length, 2);
  assert.equal(api.saves[1].state.checked.Q1, true);
});

test("load simulation: 28 activities × 200 idle waves stay O(activities)", async () => {
  const api = countingApi();
  const auth = signedInAuth();
  const activities = Array.from({ length: 28 }, (_, index) => `lesson-activity-${index + 1}`);
  const waves = 200;
  async function wave() {
    await Promise.all(activities.map((activityKey) => {
      const current = storeFor(api, { auth, activityKey });
      current.save({ responses: { Q1: "same" }, checked: { Q1: true } }, { immediate: true });
      return current.hydrate();
    }));
  }
  await wave();
  for (let index = 1; index < waves; index += 1) await wave();
  assert.equal(api.reads.length, 28);
  assert.equal(api.saves.length, 28);
});

test("fingerprint ignores updatedAt so timestamp-only saves are unchanged", () => {
  const first = persistableActivityStateFingerprint({
    responses: { Q1: "A" },
    checked: { Q1: true },
    updatedAt: "2026-09-12T08:00:00.000Z"
  });
  const second = persistableActivityStateFingerprint({
    responses: { Q1: "A" },
    checked: { Q1: true },
    updatedAt: "2026-09-12T08:00:01.000Z"
  });
  assert.equal(first, second);
});
