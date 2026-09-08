import test from "node:test";
import assert from "node:assert/strict";
import { memoryStorage } from "../helpers.js";
import {
  createActivityStateStore,
  reconcileActivityState,
  sanitizeActivityState
} from "../../src/core/progress/activity-state.js";

function signedInAuth(userId = "auth-user") {
  return {
    isSignedIn: () => true,
    getSession: () => ({ user: { id: userId } })
  };
}

function guestAuth() {
  return { isSignedIn: () => false, getSession: () => null };
}

test("sanitizeActivityState strips marks and identity without removing responses", () => {
  const clean = sanitizeActivityState({
    responses: { Q1: "a" },
    score: 9,
    maxScore: 10,
    awarded_score: 1,
    isCorrect: true,
    studentId: "0001",
    checked: { Q1: true }
  });
  assert.deepEqual(clean.responses, { Q1: "a" });
  assert.equal(clean.checked.Q1, true);
  assert.equal("score" in clean, false);
  assert.equal("maxScore" in clean, false);
  assert.equal("studentId" in clean, false);
  assert.equal("isCorrect" in clean, false);
});

test("reconcile prefers newer server state over a stale local cache", () => {
  const resolved = reconcileActivityState(
    { state: { responses: { Q1: "old" }, updatedAt: "2026-09-08T09:00:00.000Z" }, updatedAt: "2026-09-08T09:00:00.000Z" },
    { state: { responses: { Q1: "server" } }, updatedAt: "2026-09-08T10:00:00.000Z" }
  );
  assert.equal(resolved.source, "server");
  assert.equal(resolved.state.responses.Q1, "server");
  assert.equal(resolved.migrate, undefined);
});

test("reconcile keeps newer local work when a previous server save failed", () => {
  const resolved = reconcileActivityState(
    { state: { responses: { Q1: "local" } }, updatedAt: "2026-09-08T11:00:00.000Z" },
    { state: { responses: { Q1: "server" } }, updatedAt: "2026-09-08T10:00:00.000Z" }
  );
  assert.equal(resolved.source, "local");
  assert.equal(resolved.migrate, true);
  assert.equal(resolved.state.responses.Q1, "local");
});

test("getActivityState hydrates restored server state when local storage is empty", async () => {
  const api = {
    getActivityState: async () => [{
      activity_key: "week-1",
      activity_version: "1.0.0",
      status: "in_progress",
      state: { responses: { Q1: "a", Q2: "b" }, currentSectionId: "s2" },
      updated_at: "2026-09-08T10:00:00.000Z"
    }],
    saveActivityState: async () => {
      throw new Error("should not save when server is already current");
    }
  };
  const store = createActivityStateStore({
    api,
    auth: signedInAuth(),
    storage: memoryStorage(),
    activityKey: "week-1",
    activityVersion: "1.0.0"
  });
  const restored = await store.hydrate();
  assert.equal(restored.responses.Q1, "a");
  assert.equal(restored.currentSectionId, "s2");
});

test("saveActivityState keeps local work when the network save fails", async () => {
  const api = {
    getActivityState: async () => null,
    saveActivityState: async () => {
      const error = new Error("offline");
      error.code = "NETWORK";
      throw error;
    }
  };
  const storage = memoryStorage();
  const store = createActivityStateStore({
    api,
    auth: signedInAuth(),
    storage,
    activityKey: "week-1",
    activityVersion: "1.0.0"
  });
  const saved = store.save({ responses: { Q1: "kept" } }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(saved.responses.Q1, "kept");
  assert.equal(store.load().responses.Q1, "kept");
});

test("stale local cache does not overwrite a newer server draft", async () => {
  const saved = [];
  const api = {
    getActivityState: async () => [{
      activity_key: "week-1",
      activity_version: "1.0.0",
      state: { responses: { Q1: "server-new" } },
      updated_at: "2026-09-08T12:00:00.000Z"
    }],
    saveActivityState: async (payload) => {
      saved.push(payload);
      return [{ state: payload.state, updated_at: "2026-09-08T12:00:00.000Z" }];
    }
  };
  const storage = memoryStorage();
  const store = createActivityStateStore({
    api,
    auth: signedInAuth(),
    storage,
    activityKey: "week-1",
    activityVersion: "1.0.0"
  });
  const restored = await store.hydrate({
    responses: { Q1: "stale-local" },
    updatedAt: "2026-09-08T09:00:00.000Z"
  });
  assert.equal(restored.responses.Q1, "server-new");
  assert.equal(saved.length, 0);
});

test("local draft migrates to the server only when no newer server draft exists", async () => {
  const saved = [];
  const api = {
    getActivityState: async () => null,
    saveActivityState: async (payload) => {
      saved.push(payload);
      return [{ state: payload.state, updated_at: payload.clientUpdatedAt }];
    }
  };
  const store = createActivityStateStore({
    api,
    auth: signedInAuth(),
    storage: memoryStorage(),
    activityKey: "week-1",
    activityVersion: "1.0.0"
  });
  const restored = await store.hydrate({
    responses: { Q1: "migrated" },
    updatedAt: "2026-09-08T11:00:00.000Z"
  });
  assert.equal(restored.responses.Q1, "migrated");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].state.responses.Q1, "migrated");
});

test("guest drafts stay local and never call the activity-state API", async () => {
  const api = {
    getActivityState: async () => { throw new Error("nope"); },
    saveActivityState: async () => { throw new Error("nope"); }
  };
  const store = createActivityStateStore({
    api,
    auth: guestAuth(),
    storage: memoryStorage(),
    activityKey: "week-1",
    activityVersion: "1.0.0"
  });
  store.save({ responses: { Q1: "guest" } }, { immediate: true });
  const restored = await store.hydrate();
  assert.equal(restored.responses.Q1, "guest");
});

test("completed save cancels a pending in-progress upload", async () => {
  const saves = [];
  const clears = [];
  const queued = [];
  const api = {
    saveActivityState: async (payload) => {
      saves.push(payload);
      return [{ state: payload.state, updated_at: payload.clientUpdatedAt }];
    },
    clearActivityState: async (payload) => {
      clears.push(payload);
    }
  };
  const store = createActivityStateStore({
    api,
    auth: signedInAuth(),
    storage: memoryStorage(),
    activityKey: "week-1",
    activityVersion: "1.0.0",
    debounceMs: 50,
    setTimeoutFn: (fn) => {
      queued.push(fn);
      return queued.length;
    },
    clearTimeoutFn: () => {
      queued.length = 0;
    }
  });
  store.save({ responses: { Q1: "draft" } });
  store.save({
    responses: { Q1: "draft" },
    result: { score: 1, maxScore: 1 },
    submission: { status: "submitted" }
  });
  queued.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(saves.length, 0);
  assert.equal(clears.length, 1);
});
