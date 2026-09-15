import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { memoryStorage } from "../helpers.js";
import {
  createActivityStateStore,
  getActivityStateIdentityRecoveryState,
  getActivityStateLearnerBlock,
  isActivityStateLearnerBlocked,
  resetActivityStateDedupe,
  LEARNER_IDENTITY_MESSAGE
} from "../../src/core/progress/activity-state.js";
import {
  classifyActivityStateError,
  isLearnerIdentityError
} from "../../src/core/progress/activity-state-errors.js";

beforeEach(() => {
  resetActivityStateDedupe();
});

function signedInAuth(userId = "auth-orphan") {
  return {
    isSignedIn: () => true,
    getSession: () => ({ user: { id: userId } })
  };
}

function identityError() {
  const error = new Error("STUDENT_IDENTITY_NOT_FOUND");
  error.code = "STUDENT_IDENTITY_NOT_FOUND";
  error.status = 403;
  return error;
}

function storeFor(api, extras = {}) {
  return createActivityStateStore({
    api,
    auth: extras.auth || signedInAuth(extras.userId),
    storage: extras.storage || memoryStorage(),
    activityKey: extras.activityKey || "week-1-activity",
    activityVersion: extras.activityVersion || "1.0.0",
    setTimeoutFn: extras.setTimeoutFn || ((fn) => {
      fn();
      return 0;
    }),
    clearTimeoutFn: extras.clearTimeoutFn || (() => {})
  });
}

test("classifyActivityStateError treats STUDENT_IDENTITY_NOT_FOUND as permanent", () => {
  assert.equal(classifyActivityStateError(identityError()), "permanent");
  assert.equal(isLearnerIdentityError(identityError()), true);
  assert.equal(classifyActivityStateError({ status: 503, message: "busy" }), "transient");
  assert.equal(classifyActivityStateError({ status: 401 }), "permanent");
});

test("STUDENT_IDENTITY_NOT_FOUND does not automatically retry forever", async () => {
  let reads = 0;
  const api = {
    ensureLearnerAuthLink: async () => [{ linked: false }],
    getActivityState: async () => {
      reads += 1;
      throw identityError();
    }
  };
  const store = storeFor(api);
  await store.hydrate();
  await store.hydrate();
  await store.hydrate();
  await store.hydrate(null, { fresh: true });
  assert.equal(reads, 1);
  assert.equal(isActivityStateLearnerBlocked("auth:auth-orphan"), true);
  assert.equal(getActivityStateLearnerBlock("auth:auth-orphan").learnerMessage, LEARNER_IDENTITY_MESSAGE);
});

test("failed identity recovery occurs at most once per session", async () => {
  let ensureCalls = 0;
  let reads = 0;
  const api = {
    ensureLearnerAuthLink: async () => {
      ensureCalls += 1;
      return [{ linked: false }];
    },
    getActivityState: async () => {
      reads += 1;
      throw identityError();
    }
  };
  const activities = Array.from({ length: 28 }, (_, index) => `activity-${index + 1}`);
  await Promise.all(activities.map((activityKey) => storeFor(api, { activityKey }).hydrate()));
  await Promise.all(activities.map((activityKey) => storeFor(api, { activityKey }).hydrate()));
  assert.equal(ensureCalls, 1);
  assert.ok(reads <= 28);
  assert.equal(getActivityStateIdentityRecoveryState()?.status, "failed");
});

test("successful identity recovery resumes loading once", async () => {
  let ensureCalls = 0;
  let reads = 0;
  const api = {
    ensureLearnerAuthLink: async () => {
      ensureCalls += 1;
      return [{ linked: true, student_number: "s1" }];
    },
    getActivityState: async () => {
      reads += 1;
      if (reads === 1) throw identityError();
      return [{
        state: { responses: { Q1: "restored" } },
        updated_at: "2026-09-15T12:00:00.000Z"
      }];
    }
  };
  const restored = await storeFor(api).hydrate();
  assert.equal(ensureCalls, 1);
  assert.equal(reads, 2);
  assert.equal(restored.responses.Q1, "restored");
  assert.equal(getActivityStateIdentityRecoveryState()?.status, "recovered");
  assert.equal(isActivityStateLearnerBlocked("auth:auth-orphan"), false);
});

test("transient 503 uses bounded retry then stops", async () => {
  let reads = 0;
  const api = {
    getActivityState: async () => {
      reads += 1;
      const error = new Error("upstream");
      error.status = 503;
      throw error;
    }
  };
  await storeFor(api).hydrate();
  assert.equal(reads, 4);
  await storeFor(api).hydrate();
  assert.ok(reads >= 4);
});

test("duplicate simultaneous identity failures share recovery and do not storm", async () => {
  let reads = 0;
  let ensureCalls = 0;
  let inFlight = 0;
  let peak = 0;
  const api = {
    ensureLearnerAuthLink: async () => {
      ensureCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [{ linked: false }];
    },
    getActivityState: async () => {
      reads += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      throw identityError();
    }
  };
  const activities = Array.from({ length: 28 }, (_, index) => `burst-${index + 1}`);
  await Promise.all(activities.map((activityKey) => storeFor(api, { activityKey }).hydrate()));
  const afterFirst = reads;
  await Promise.all(activities.map((activityKey) => storeFor(api, { activityKey }).hydrate()));
  assert.equal(ensureCalls, 1);
  assert.equal(reads, afterFirst);
  assert.ok(afterFirst <= 28);
});

test("classroom simulation: 30 healthy + 3 broken stay bounded", async () => {
  const healthyReads = [];
  const brokenReads = [];
  function apiFor(label, broken) {
    return {
      ensureLearnerAuthLink: async () => [{ linked: false }],
      getActivityState: async (payload) => {
        if (broken) brokenReads.push(payload);
        else healthyReads.push(payload);
        if (broken) throw identityError();
        return [{ state: { responses: { Q1: label } }, updated_at: "2026-09-15T12:00:00.000Z" }];
      }
    };
  }
  const activities = Array.from({ length: 28 }, (_, index) => `lesson-${index + 1}`);
  const healthy = Array.from({ length: 30 }, (_, index) => ({
    userId: `healthy-${index + 1}`,
    api: apiFor(`healthy-${index + 1}`, false)
  }));
  const broken = Array.from({ length: 3 }, (_, index) => ({
    userId: `broken-${index + 1}`,
    api: apiFor(`broken-${index + 1}`, true)
  }));

  async function openLearner(learner) {
    await Promise.all(activities.map((activityKey) => storeFor(learner.api, {
      userId: learner.userId,
      activityKey,
      storage: memoryStorage()
    }).hydrate()));
  }

  await Promise.all([...healthy, ...broken].map((learner) => openLearner(learner)));
  // Broken learners re-enter week hydrate waves the way platformState churn did.
  await Promise.all(broken.map((learner) => openLearner(learner)));
  await Promise.all(broken.map((learner) => openLearner(learner)));

  assert.equal(healthyReads.length, 30 * 28);
  assert.ok(brokenReads.length <= 3 * 28);
  assert.ok(brokenReads.length < 3 * 28 * 3);
});
