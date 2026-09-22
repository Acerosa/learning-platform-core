import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { memoryStorage } from "../helpers.js";
import {
  createActivityStateStore,
  resetActivityStateDedupe,
  pickLatestCompletedAttempt,
  reconstructCompletedAttemptState,
  ACTIVITY_STATE_PERSIST_STATUS
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

function wait(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function completedAttempt(extras = {}) {
  return {
    attempt_id: extras.attemptId || "attempt-1",
    activity_key: extras.activityKey || "week-1-welcome",
    activity_version: extras.activityVersion || "0.1.0",
    status: "completed",
    received_at: extras.receivedAt || "2026-09-15T10:00:00.000Z",
    completed_at: extras.completedAt || "2026-09-15T10:00:00.000Z",
    client_started_at: extras.startedAt || "2026-09-15T09:50:00.000Z"
  };
}

function storeFor(api, extras = {}) {
  return createActivityStateStore({
    api,
    auth: extras.auth || signedInAuth(extras.userId),
    storage: extras.storage || memoryStorage(),
    activityKey: extras.activityKey || "week-1-welcome",
    activityVersion: extras.activityVersion || "0.1.0",
    debounceMs: extras.debounceMs ?? 10,
    persistWaitMs: extras.persistWaitMs ?? 200,
    saveRetryBackoffMs: extras.saveRetryBackoffMs || [20, 40, 80, 160],
    setTimeoutFn: extras.setTimeoutFn,
    clearTimeoutFn: extras.clearTimeoutFn,
    addEventListenerFn: extras.addEventListenerFn,
    removeEventListenerFn: extras.removeEventListenerFn
  });
}

test("pickLatestCompletedAttempt keeps the same activity version only", () => {
  const chosen = pickLatestCompletedAttempt([
    completedAttempt({ attemptId: "old", activityVersion: "0.1.0", receivedAt: "2026-09-01T00:00:00.000Z" }),
    completedAttempt({ attemptId: "other-version", activityVersion: "0.2.0", receivedAt: "2026-09-20T00:00:00.000Z" }),
    completedAttempt({ attemptId: "latest", activityVersion: "0.1.0", receivedAt: "2026-09-15T00:00:00.000Z" })
  ], "week-1-welcome", "0.1.0");
  assert.equal(chosen.attempt_id, "latest");
});

test("reconstructCompletedAttemptState maps evidence payloads into UI responses", () => {
  const state = reconstructCompletedAttemptState(completedAttempt(), [
    { attempt_id: "attempt-1", question_key: "q1", response_payload: { optionId: "b" } },
    { attempt_id: "attempt-1", question_key: "q2", response_payload: { text: "IoT" } },
    {
      attempt_id: "attempt-1",
      question_key: "sort:item-1",
      response_payload: { categoryId: "current", itemId: "item-1" }
    }
  ]);
  assert.equal(state.responses.q1, "b");
  assert.equal(state.responses.q2, "IoT");
  assert.equal(state.responses.sort["item-1"], "current");
  assert.equal(state.checked.q1, true);
  assert.equal(state.restoreSource, "completed-attempt");
  assert.equal(state.submission.status, "submitted");
});

test("in-progress restore loads the remote draft", async () => {
  const api = {
    getActivityState: async () => [{
      state: { responses: { q1: "draft" }, checked: { q1: true } },
      status: "in_progress",
      updated_at: "2026-09-22T10:00:00.000Z"
    }],
    getAttempts: async () => { throw new Error("should not read attempts when a draft exists"); },
    saveActivityState: async () => { throw new Error("should not save"); }
  };
  const restored = await storeFor(api).hydrate();
  assert.equal(restored.responses.q1, "draft");
});

test("completed restore reconstructs answers when no in-progress draft exists", async () => {
  const api = {
    getActivityState: async () => [],
    getAttempts: async () => [completedAttempt()],
    getResponses: async () => [{
      attempt_id: "attempt-1",
      question_key: "q1",
      response_payload: { optionId: "c" }
    }],
    saveActivityState: async () => { throw new Error("restore must be read-only"); },
    submitAttempt: async () => { throw new Error("restore must not submit"); }
  };
  const restored = await storeFor(api).hydrate();
  assert.equal(restored.responses.q1, "c");
  assert.equal(restored.restoreSource, "completed-attempt");
  assert.equal(restored.submission.status, "submitted");
});

test("opening completed work issues zero save and zero submit calls", async () => {
  const saves = [];
  const submits = [];
  const api = {
    getActivityState: async () => null,
    getAttempts: async () => [completedAttempt()],
    getResponses: async () => [{
      attempt_id: "attempt-1",
      question_key: "q1",
      response_payload: { optionId: "a" }
    }],
    saveActivityState: async (payload) => { saves.push(payload); return [{ state: payload.state }]; },
    submitAttempt: async (payload) => { submits.push(payload); return {}; }
  };
  const store = storeFor(api);
  await store.hydrate();
  await wait(40);
  assert.equal(saves.length, 0);
  assert.equal(submits.length, 0);
});

test("no draft and no completed attempt is a legitimate empty state", async () => {
  const api = {
    getActivityState: async () => [],
    getAttempts: async () => [],
    getResponses: async () => []
  };
  const restored = await storeFor(api).hydrate();
  assert.equal(restored, null);
});

test("GET failure is not interned as no work and can recover", async () => {
  let reads = 0;
  const api = {
    getActivityState: async () => {
      reads += 1;
      if (reads <= 4) {
        const error = new Error("timeout");
        error.status = 503;
        throw error;
      }
      return [{
        state: { responses: { q1: "recovered" } },
        updated_at: "2026-09-22T11:00:00.000Z"
      }];
    },
    getAttempts: async () => []
  };
  const store = storeFor(api, {
    persistWaitMs: 20,
    setTimeoutFn: (fn) => {
      fn();
      return 0;
    },
    clearTimeoutFn: () => {}
  });
  const first = await store.hydrate();
  assert.equal(first, null);
  assert.equal(store.persistStatus().status, ACTIVITY_STATE_PERSIST_STATUS.retrievalFailed);
  const second = await store.hydrate();
  assert.equal(second.responses.q1, "recovered");
  assert.ok(reads >= 5);
});

test("authentication delay does not intern empty work before the session is ready", async () => {
  let session = null;
  const auth = {
    isSignedIn: () => true,
    getSession: () => session,
    getState: () => ({ status: session ? "authenticated" : "loading" })
  };
  let reads = 0;
  const api = {
    getActivityState: async () => {
      reads += 1;
      return [{
        state: { responses: { q1: "after-auth" } },
        updated_at: "2026-09-22T12:00:00.000Z"
      }];
    },
    getAttempts: async () => []
  };
  const store = storeFor(api, { auth, persistWaitMs: 400 });
  const pending = store.hydrate();
  await wait(40);
  assert.equal(reads, 0);
  session = { user: { id: "auth-user" } };
  const restored = await pending;
  assert.equal(restored.responses.q1, "after-auth");
  assert.equal(reads, 1);
});

test("failed draft save keeps local pending work and retries", async () => {
  let shouldFail = true;
  const saves = [];
  const api = {
    getActivityState: async () => [],
    getAttempts: async () => [],
    saveActivityState: async (payload) => {
      saves.push(payload.state.responses.q1);
      if (shouldFail) {
        const error = new Error("offline");
        error.code = "NETWORK";
        throw error;
      }
      return [{ state: payload.state, updated_at: payload.clientUpdatedAt, revision: saves.length }];
    }
  };
  const store = storeFor(api);
  store.save({ responses: { q1: "kept" } }, { immediate: true });
  await wait(30);
  assert.equal(store.load().responses.q1, "kept");
  assert.equal(store.isDirty(), true);
  assert.equal(store.persistStatus().status, ACTIVITY_STATE_PERSIST_STATUS.failed);
  shouldFail = false;
  await wait(40);
  assert.equal(saves.at(-1), "kept");
  assert.equal(store.isDirty(), false);
  assert.equal(store.persistStatus().status, ACTIVITY_STATE_PERSIST_STATUS.synced);
  assert.equal(store.lastRemoteSaveSucceeded(), true);
});

test("out-of-order older save acknowledgement must not mark a newer revision clean", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let saveCount = 0;
  const api = {
    getActivityState: async () => [],
    getAttempts: async () => [],
    saveActivityState: async (payload) => {
      saveCount += 1;
      const current = saveCount;
      if (current === 1) await firstGate;
      if (current >= 2) await wait(40);
      return [{
        state: payload.state,
        updated_at: payload.clientUpdatedAt,
        revision: current
      }];
    }
  };
  const store = storeFor(api);
  store.save({ responses: { q1: "rev-1" } }, { immediate: true });
  await wait(10);
  store.save({ responses: { q1: "rev-2" } }, { immediate: true });
  releaseFirst();
  await wait(20);
  assert.equal(store.load().responses.q1, "rev-2");
  assert.equal(store.isDirty(), true);
  await wait(50);
  store.destroy();
});

test("offline edit retries on the online event and then syncs", async () => {
  const listeners = {};
  let online = false;
  const saves = [];
  const api = {
    getActivityState: async () => [],
    getAttempts: async () => [],
    saveActivityState: async (payload) => {
      if (!online) {
        const error = new Error("offline");
        error.code = "NETWORK";
        throw error;
      }
      saves.push(payload);
      return [{ state: payload.state, updated_at: payload.clientUpdatedAt, revision: 1 }];
    }
  };
  const store = storeFor(api, {
    addEventListenerFn: (type, fn) => { listeners[type] = fn; },
    removeEventListenerFn: () => {}
  });
  store.save({ responses: { q1: "offline-work" } }, { immediate: true });
  await wait(20);
  assert.equal(store.isDirty(), true);
  assert.equal(saves.length, 0);
  online = true;
  listeners.online();
  await wait(20);
  assert.equal(saves.length, 1);
  assert.equal(store.isDirty(), false);
  assert.equal(store.persistStatus().status, ACTIVITY_STATE_PERSIST_STATUS.synced);
});

test("cross-device model reconstructs Device B from completed attempt responses", async () => {
  const api = {
    getActivityState: async () => [],
    getAttempts: async () => [completedAttempt()],
    getResponses: async (query) => {
      assert.equal(query.attemptId, "attempt-1");
      return [{
        attempt_id: "attempt-1",
        question_key: "q1",
        response_payload: { optionId: "nfc" }
      }];
    },
    saveActivityState: async () => { throw new Error("device B restore is read-only"); }
  };
  const deviceB = storeFor(api, { storage: memoryStorage() });
  const restored = await deviceB.hydrate();
  assert.equal(restored.responses.q1, "nfc");
  assert.equal(deviceB.load().responses.q1, "nfc");
});

test("unsynchronised local work wins over an older completed snapshot", async () => {
  const saves = [];
  const api = {
    getActivityState: async () => [],
    getAttempts: async () => [completedAttempt({ completedAt: "2026-09-22T10:00:00.000Z" })],
    getResponses: async () => [{
      attempt_id: "attempt-1",
      question_key: "q1",
      response_payload: { optionId: "old" }
    }],
    saveActivityState: async (payload) => {
      saves.push(payload);
      return [{ state: payload.state, updated_at: payload.clientUpdatedAt, revision: 1 }];
    }
  };
  const storage = memoryStorage();
  const store = storeFor(api, { storage });
  store.save({
    responses: { q1: "newer-local" },
    pendingSave: true,
    updatedAt: "2026-09-22T10:30:00.000Z"
  }, { remote: false });
  const restored = await store.hydrate();
  assert.equal(restored.responses.q1, "newer-local");
  await wait(30);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].state.responses.q1, "newer-local");
});

test("u3-w01-baseline 1.3.0 does not restore a 1.2.0 completed attempt", async () => {
  const api = {
    getActivityState: async () => [],
    getAttempts: async () => [
      completedAttempt({
        attemptId: "v120",
        activityKey: "u3-w01-baseline",
        activityVersion: "1.2.0",
        receivedAt: "2026-09-20T00:00:00.000Z"
      })
    ],
    getResponses: async () => [{
      attempt_id: "v120",
      question_key: "q1",
      response_payload: { optionId: "legacy" }
    }]
  };
  const restored = await storeFor(api, {
    activityKey: "u3-w01-baseline",
    activityVersion: "1.3.0"
  }).hydrate();
  assert.equal(restored, null);
});
