/**
 * Session-level learner identity recovery for activity-state reads.
 * At most one ensure_learner_auth_link attempt per auth identity per page session.
 */

import { isLearnerIdentityError } from "./activity-state-errors.js";

const recoveryByLearner = new Map();
const listeners = new Set();

function firstRow(result) {
  if (Array.isArray(result)) return result[0] || null;
  return result || null;
}

export function resetActivityStateIdentityRecovery() {
  recoveryByLearner.clear();
}

export function getActivityStateIdentityRecoveryState(learnerKey) {
  if (learnerKey != null) {
    const row = recoveryByLearner.get(String(learnerKey));
    return row?.state ? { ...row.state } : null;
  }
  const first = recoveryByLearner.values().next().value;
  return first?.state ? { ...first.state } : null;
}

export function subscribeActivityStateIdentityRecovery(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(state) {
  listeners.forEach((listener) => {
    try { listener(state); } catch {}
  });
}

/**
 * Attempt a single shared identity repair for the current learner.
 * Concurrent callers for the same learnerKey await the same promise.
 */
export async function recoverLearnerIdentityOnce({ api, learnerKey } = {}) {
  const key = String(learnerKey || "authenticated");
  const existing = recoveryByLearner.get(key);
  if (existing?.state) {
    return {
      recovered: existing.state.status === "recovered",
      attempted: false,
      status: existing.state.status
    };
  }
  if (existing?.promise) return existing.promise;

  const entry = { promise: null, state: null };
  entry.promise = (async () => {
    if (typeof api?.ensureLearnerAuthLink !== "function") {
      entry.state = { learnerKey: key, status: "failed" };
      emit(entry.state);
      return { recovered: false, attempted: true, status: "failed" };
    }
    try {
      const row = firstRow(await api.ensureLearnerAuthLink());
      const linked = Boolean(row?.linked);
      if (linked) {
        entry.state = { learnerKey: key, status: "recovered" };
        emit(entry.state);
        return { recovered: true, attempted: true, status: "recovered" };
      }
      entry.state = { learnerKey: key, status: "failed" };
      emit(entry.state);
      return { recovered: false, attempted: true, status: "failed" };
    } catch (error) {
      entry.state = {
        learnerKey: key,
        status: "failed",
        code: isLearnerIdentityError(error)
          ? "STUDENT_IDENTITY_NOT_FOUND"
          : String(error?.code || "RECOVERY_FAILED")
      };
      emit(entry.state);
      return { recovered: false, attempted: true, status: "failed", error };
    } finally {
      entry.promise = null;
    }
  })();
  recoveryByLearner.set(key, entry);
  return entry.promise;
}
