import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { memoryStorage } from "../helpers.js";
import {
  createActivityStateStore,
  getOrCreateActivityStateStore,
  listRegisteredActivityStateStores,
  resetActivityStateDedupe
} from "../../src/core/progress/activity-state.js";
import {
  ACTIVITY_STATE_INVALIDATION_EVENT,
  activityStateSyncTopic
} from "../../src/core/progress/activity-state.js";
import { createActivityStateSync } from "../../src/core/progress/activity-state-sync.js";
import { createProgressService } from "../../src/core/progress/progress-service.js";

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
  let revision = Number(options.revision) || 0;
  const api = {
    reads,
    saves,
    getActivityState: async (payload) => {
      reads.push(payload);
      if (typeof options.read === "function") return options.read(payload, revision);
      if (options.read !== undefined) return options.read;
      return [{
        state: options.state || {},
        updated_at: options.updatedAt || "2026-09-12T09:00:00.000Z",
        revision
      }];
    },
    saveActivityState: async (payload) => {
      saves.push(payload);
      revision += 1;
      return [{
        state: payload.state,
        updated_at: payload.clientUpdatedAt,
        revision
      }];
    }
  };
  return api;
}

function storeFor(api, extras = {}) {
  const create = extras.intern ? getOrCreateActivityStateStore : createActivityStateStore;
  return create({
    api,
    auth: extras.auth || signedInAuth(extras.userId),
    storage: extras.storage || memoryStorage(),
    activityKey: extras.activityKey || "activity-12",
    activityVersion: extras.activityVersion || "1.0.0",
    debounceMs: extras.debounceMs,
    setTimeoutFn: extras.setTimeoutFn,
    clearTimeoutFn: extras.clearTimeoutFn
  });
}

function wait(ms = 60) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeRealtimeClient() {
  const channels = [];
  const client = {
    channels,
    removeChannel: async (channel) => {
      channel.status = "CLOSED";
      channel._statusCb?.("CLOSED");
    },
    realtime: { setAuth: async () => {} },
    channel(topic, config) {
      const channel = {
        topic,
        config,
        handlers: [],
        status: "closed",
        on(type, filter, cb) {
          this.handlers.push({ type, filter, cb });
          return this;
        },
        subscribe(cb) {
          this._statusCb = cb;
          this.status = "SUBSCRIBED";
          cb?.("SUBSCRIBED");
          return this;
        },
        emit(payload) {
          this.handlers.forEach((handler) => handler.cb({ payload }));
        },
        reconnect() {
          this.status = "SUBSCRIBED";
          this._statusCb?.("SUBSCRIBED");
        },
        drop() {
          this.status = "CHANNEL_ERROR";
          this._statusCb?.("CHANNEL_ERROR");
        }
      };
      channels.push(channel);
      return channel;
    }
  };
  return client;
}

test("C. a remote Activity 12 event hydrates only that activity", async () => {
  const api = countingApi({ revision: 1, state: { responses: { Q1: "remote" } } });
  const auth = signedInAuth();
  const twelve = storeFor(api, { auth, intern: true, activityKey: "activity-12" });
  const other = storeFor(api, { auth, intern: true, activityKey: "activity-1" });
  await twelve.hydrate();
  await other.hydrate();
  assert.equal(api.reads.length, 2);
  await twelve.handleRemoteInvalidation({ activityId: "activity-12", revision: 4 });
  await wait();
  assert.equal(api.reads.length, 3);
  assert.equal(api.reads[2].activityKey, "activity-12");
});

test("E. a duplicate revision does not refresh again", async () => {
  const api = countingApi({ revision: 4, state: { responses: { Q1: "remote" } } });
  const store = storeFor(api, { intern: true });
  await store.hydrate();
  await store.handleRemoteInvalidation({ revision: 4 });
  await store.handleRemoteInvalidation({ revision: 4 });
  await wait();
  assert.equal(api.reads.length, 1);
});

test("F. a short event burst coalesces to one fresh read", async () => {
  const api = countingApi({ revision: 1, state: { responses: { Q1: "a" } } });
  const store = storeFor(api, { intern: true });
  await store.hydrate();
  await Promise.all([
    store.handleRemoteInvalidation({ revision: 101 }),
    store.handleRemoteInvalidation({ revision: 102 }),
    store.handleRemoteInvalidation({ revision: 103 })
  ]);
  await wait();
  assert.equal(api.reads.length, 2);
});

test("G. remote events for two activities refresh only those stores", async () => {
  const api = countingApi({ revision: 1 });
  const auth = signedInAuth();
  const four = storeFor(api, { auth, intern: true, activityKey: "activity-4" });
  const twelve = storeFor(api, { auth, intern: true, activityKey: "activity-12" });
  const other = storeFor(api, { auth, intern: true, activityKey: "activity-7" });
  await Promise.all([four.hydrate(), twelve.hydrate(), other.hydrate()]);
  await four.handleRemoteInvalidation({ revision: 8 });
  await twelve.handleRemoteInvalidation({ revision: 9 });
  await wait();
  assert.equal(api.reads.length, 5);
  assert.deepEqual(api.reads.slice(3).map((item) => item.activityKey).sort(), [
    "activity-12",
    "activity-4"
  ]);
});

test("H. a local save's own revision does not refetch", async () => {
  const api = countingApi({ revision: 1, state: { responses: { Q1: "A" } } });
  const store = storeFor(api, { intern: true });
  await store.hydrate();
  store.save({ responses: { Q1: "B" } }, { immediate: true });
  await wait(0);
  assert.equal(api.saves.length, 1);
  await store.handleRemoteInvalidation({ revision: store.knownRevision() });
  await wait();
  assert.equal(api.reads.length, 1);
});

test("10 own Activity 12 saves do not self-refresh", async () => {
  const api = countingApi({ revision: 1, state: { responses: {} } });
  const store = storeFor(api, { intern: true });
  await store.hydrate();
  for (let index = 0; index < 10; index += 1) {
    store.save({ responses: { Q1: `v${index}` } }, { immediate: true });
    await wait(0);
    await store.handleRemoteInvalidation({ revision: store.knownRevision() });
  }
  await wait();
  assert.equal(api.saves.length, 10);
  assert.equal(api.reads.length, 1);
});

test("K. dirty local input is not replaced by a newer remote revision", async () => {
  const api = countingApi({ revision: 1, state: { responses: { Q1: "server" } } });
  const store = storeFor(api, {
    intern: true,
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {}
  });
  await store.hydrate();
  store.save({ responses: { Q1: "typing" } });
  assert.equal(store.isDirty(), true);
  await store.handleRemoteInvalidation({ revision: 9 });
  await wait();
  assert.equal(api.reads.length, 1);
  assert.equal(store.load().responses.Q1, "typing");
});

test("markDirty without persist defers remote hydrate and does not call RPCs", async () => {
  const api = countingApi({ revision: 0, state: { responses: {} } });
  const store = storeFor(api, { intern: true, activityKey: "week-1-lesson-1-ex-07" });
  const other = storeFor(api, { intern: true, activityKey: "week-1-lesson-1-ex-01" });
  await Promise.all([store.hydrate(), other.hydrate()]);
  assert.equal(api.reads.length, 2);
  store.markDirty();
  assert.equal(store.isDirty(), true);
  await store.handleRemoteInvalidation({ revision: 2 });
  await wait();
  assert.equal(api.reads.length, 2);
  assert.equal(api.saves.length, 0);
  assert.equal(store.pendingRemoteRevision(), 2);
});

test("Classification unsaved mapping stays local while a newer remote revision is deferred", async () => {
  const api = countingApi({ revision: 0, state: { responses: {} } });
  const store = storeFor(api, { intern: true, activityKey: "week-1-lesson-1-ex-07" });
  const other = storeFor(api, { intern: true, activityKey: "week-1-lesson-1-ex-01" });
  await Promise.all([store.hydrate(), other.hydrate()]);
  store.markDirty();
  store.save({ responses: { "item-1": "not-user" } }, { remote: false });
  assert.equal(store.isDirty(), true);
  await store.handleRemoteInvalidation({ revision: 4 });
  await wait();
  assert.equal(api.reads.length, 2);
  assert.equal(api.saves.length, 0);
  assert.equal(store.load().responses["item-1"], "not-user");
  assert.equal(store.pendingRemoteRevision(), 4);
});

test("A. local save revision >= deferred remote does not refresh", async () => {
  const api = countingApi({ revision: 0, state: { responses: {} } });
  const originalSave = api.saveActivityState;
  api.saveActivityState = async (payload) => {
    const rows = await originalSave(payload);
    rows[0].revision = 5;
    return rows;
  };
  const store = storeFor(api, { intern: true, activityKey: "week-1-lesson-1-ex-07" });
  const other = storeFor(api, { intern: true, activityKey: "week-1-lesson-1-ex-01" });
  await Promise.all([store.hydrate(), other.hydrate()]);
  store.save({ responses: { "item-1": "not-user" } }, { remote: false });
  await store.handleRemoteInvalidation({ revision: 4 });
  store.save({ responses: { "item-1": "not-user" } }, { immediate: true });
  await wait();
  assert.equal(api.saves.length, 1);
  assert.equal(api.reads.length, 2);
  assert.equal(store.pendingRemoteRevision(), 0);
  assert.equal(store.load().responses["item-1"], "not-user");
});

test("B. deferred remote still newer hydrates only that activity once after local save", async () => {
  const api = countingApi({
    revision: 0,
    state: { responses: {} }
  });
  let readRevision = 0;
  const originalRead = api.getActivityState;
  api.getActivityState = async (payload) => {
    const rows = await originalRead(payload);
    if (readRevision) {
      rows[0].revision = readRevision;
      rows[0].state = { responses: { "item-1": "user" } };
      rows[0].updated_at = "2099-01-01T00:00:00.000Z";
    }
    return rows;
  };
  const store = storeFor(api, { intern: true, activityKey: "week-1-lesson-1-ex-07" });
  const other = storeFor(api, { intern: true, activityKey: "week-1-lesson-1-ex-01" });
  await Promise.all([store.hydrate(), other.hydrate()]);
  store.save({ responses: { "item-1": "not-user" } }, { remote: false });
  await store.handleRemoteInvalidation({ revision: 4 });
  assert.equal(api.reads.length, 2);
  readRevision = 4;
  store.save({ responses: { "item-1": "not-user" } }, { immediate: true });
  await wait();
  assert.equal(api.saves.length, 1);
  assert.equal(api.reads.length, 3);
  assert.equal(api.reads[2].activityKey, "week-1-lesson-1-ex-07");
  assert.equal(store.pendingRemoteRevision(), 0);
});

test("L. a deferred remote revision is dropped if the local save became current", async () => {
  const api = countingApi({
    revision: 1,
    read: async () => [{
      state: { responses: { Q1: "server" } },
      updated_at: "2026-09-12T10:00:00.000Z",
      revision: 1
    }]
  });
  const originalSave = api.saveActivityState;
  api.saveActivityState = async (payload) => {
    const rows = await originalSave(payload);
    rows[0].revision = 10;
    return rows;
  };
  const store = storeFor(api, { intern: true, debounceMs: 60_000 });
  await store.hydrate();
  store.save({ responses: { Q1: "typing" } });
  await store.handleRemoteInvalidation({ revision: 9 });
  assert.equal(store.load().responses.Q1, "typing");
  store.save({ responses: { Q1: "typing-done" } }, { immediate: true });
  await wait();
  assert.equal(store.load().responses.Q1, "typing-done");
  assert.equal(api.reads.length, 1);
});

test("M. a failed save stays dirty and retryable", async () => {
  const api = countingApi();
  api.saveActivityState = async (payload) => {
    api.saves.push(payload);
    throw new Error("save-failed");
  };
  const store = storeFor(api, { intern: true });
  store.save({ responses: { Q1: "retry" } }, { immediate: true });
  await wait(0);
  assert.equal(store.isDirty(), true);
  await store.handleRemoteInvalidation({ revision: 3 });
  await wait();
  assert.equal(api.reads.length, 0);
  assert.equal(store.load().responses.Q1, "retry");
});

test("N. interned stores do not leak across learners", async () => {
  const api = countingApi({ state: { responses: { Q1: "secret" } }, revision: 1 });
  const first = storeFor(api, { intern: true, userId: "learner-a", activityKey: "shared" });
  await first.hydrate();
  const second = storeFor(api, {
    intern: true,
    userId: "learner-b",
    activityKey: "shared",
    storage: memoryStorage()
  });
  await second.hydrate();
  assert.equal(api.reads.length, 2);
  assert.equal(listRegisteredActivityStateStores().every((store) => (
    store.activityKey === "shared"
  )), true);
});

test("O. activity versions are separate stores", async () => {
  const api = countingApi({ revision: 1 });
  const auth = signedInAuth();
  await storeFor(api, { auth, intern: true, activityVersion: "1.0.0" }).hydrate();
  await storeFor(api, { auth, intern: true, activityVersion: "2.0.0" }).hydrate();
  assert.equal(api.reads.length, 2);
});

test("progress.createStore returns a stable interned instance", () => {
  const api = countingApi();
  const auth = signedInAuth();
  const progress = createProgressService(api, { auth, storage: memoryStorage() });
  const first = progress.createStore({ activityKey: "week-1-a", activityVersion: "1.0.0" });
  const second = progress.createStore({ activityKey: "week-1-a", activityVersion: "1.0.0" });
  assert.equal(first, second);
});

test("one private Realtime channel per learner receives Activity 12 only", async () => {
  const api = countingApi({ revision: 1, state: { responses: { Q1: "a" } } });
  const auth = signedInAuth("learner-a");
  const twelve = storeFor(api, { auth, intern: true, activityKey: "activity-12" });
  const other = storeFor(api, { auth, intern: true, activityKey: "activity-1" });
  await twelve.hydrate();
  await other.hydrate();
  const client = fakeRealtimeClient();
  const sync = createActivityStateSync({ client, auth });
  await sync.start();
  assert.equal(client.channels.length, 1);
  assert.equal(client.channels[0].topic, activityStateSyncTopic("learner-a"));
  assert.equal(client.channels[0].config.config.private, true);
  client.channels[0].emit({
    activityId: "activity-12",
    version: "1.0.0",
    revision: 6,
    updatedAt: "2026-09-12T10:00:00.000Z"
  });
  await wait();
  assert.equal(api.reads.length, 3);
  assert.equal(api.reads[2].activityKey, "activity-12");
  await sync.start();
  assert.equal(client.channels.length, 1);
});

test("P. reconnect reconciles mounted stores once", async () => {
  const api = countingApi({ revision: 1 });
  const auth = signedInAuth("learner-a");
  await storeFor(api, { auth, intern: true, activityKey: "activity-12" }).hydrate();
  const client = fakeRealtimeClient();
  const sync = createActivityStateSync({ client, auth, coalesceMs: 0 });
  await sync.start();
  assert.equal(api.reads.length, 1);
  client.channels[0].drop();
  client.channels[0].reconnect();
  await wait(20);
  assert.equal(api.reads.length, 2);
  client.channels[0].drop();
  client.channels[0].reconnect();
  await wait(20);
  assert.equal(api.reads.length, 3);
});

test("logout stops the learner channel before another user can start", async () => {
  const auth = {
    isSignedIn: () => true,
    getSession: () => ({ user: { id: "learner-a" } })
  };
  const client = fakeRealtimeClient();
  const sync = createActivityStateSync({ client, auth });
  await sync.start();
  assert.equal(sync.currentTopic(), activityStateSyncTopic("learner-a"));
  await sync.reset();
  assert.equal(sync.currentTopic(), null);
  auth.getSession = () => ({ user: { id: "learner-b" } });
  await sync.start();
  assert.equal(client.channels.filter((channel) => channel.status === "SUBSCRIBED").length, 1);
  assert.equal(sync.currentTopic(), activityStateSyncTopic("learner-b"));
});

test("A/B/T. 28 interned activities idle then one Activity 12 remote event", async () => {
  const api = countingApi({ revision: 1 });
  const auth = signedInAuth();
  const stores = Array.from({ length: 28 }, (_, index) => storeFor(api, {
    auth,
    intern: true,
    activityKey: `lesson-activity-${index + 1}`
  }));
  await Promise.all(stores.map((store) => store.hydrate()));
  assert.equal(api.reads.length, 28);
  for (let wave = 0; wave < 200; wave += 1) {
    await Promise.all(stores.map((store) => store.hydrate()));
  }
  assert.equal(api.reads.length, 28);
  await stores[11].handleRemoteInvalidation({ revision: 4 });
  await wait();
  assert.equal(api.reads.length, 29);
  assert.equal(api.reads[28].activityKey, "lesson-activity-12");
});

test("shared auth object identity switch keeps the new learner store interned", async () => {
  const api = countingApi({ revision: 1 });
  const auth = {
    isSignedIn: () => true,
    getSession: () => ({ user: { id: "learner-a" } })
  };
  const first = storeFor(api, { auth, intern: true, activityKey: "shared" });
  await first.hydrate();
  auth.getSession = () => ({ user: { id: "learner-b" } });
  const second = storeFor(api, { auth, intern: true, activityKey: "shared", storage: memoryStorage() });
  await second.hydrate();
  assert.equal(
    getOrCreateActivityStateStore({
      api,
      auth,
      storage: memoryStorage(),
      activityKey: "shared",
      activityVersion: "1.0.0"
    }),
    second
  );
  assert.equal(api.reads.length, 2);
});

test("invalidation payload never needs answer-key fields", () => {
  assert.equal(ACTIVITY_STATE_INVALIDATION_EVENT, "activity_state_invalidated");
  assert.match(activityStateSyncTopic("abc"), /^learner-state:abc$/);
});
