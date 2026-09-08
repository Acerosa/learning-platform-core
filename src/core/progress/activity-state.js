import { PlatformError } from "../errors/platform-error.js";
import { canonicalActivityVersion } from "../security/hub-security-baseline.js";

export const ACTIVITY_STATE_CACHE_PREFIX = "learning-platform.activity-state.v1";

const FORBIDDEN_KEY = /^(score|max_score|maxscore|awarded_score|awardedscore|is_correct|iscorrect|marking_source|markingsource|total_score|totalscore|percentage|correctvalues|correct_values|correctoptionid|correct_option_id|correctcategoryid|correct_category_id|correctmapping|correct_mapping|answerkey|answer_key|learnerid|learner_id|studentid|student_id|studentnumber|student_number|enrolmentid|enrolment_id|assignmentid|assignment_id|attemptnumber|attempt_number|groupid|group_id|firstname|first_name|surname|email)$/i;

export function sanitizeActivityState(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeActivityState(item));
  if (!value || typeof value !== "object") return value;
  const next = {};
  Object.keys(value).forEach((key) => {
    if (FORBIDDEN_KEY.test(key.replace(/[^a-zA-Z0-9]/g, ""))) return;
    if (FORBIDDEN_KEY.test(key)) return;
    next[key] = sanitizeActivityState(value[key]);
  });
  return next;
}

export function activityStateHasWork(state) {
  if (!state || typeof state !== "object") return false;
  const responses = state.responses;
  if (responses && typeof responses === "object" && Object.keys(responses).length > 0) return true;
  if (Array.isArray(state.submittedSections) && state.submittedSections.length > 0) return true;
  if (state.markedSections && typeof state.markedSections === "object" && Object.keys(state.markedSections).length > 0) {
    return true;
  }
  if (state.checked && typeof state.checked === "object" && Object.keys(state.checked).length > 0) return true;
  return false;
}

export function isCompletedActivityState(state) {
  if (!state || typeof state !== "object") return false;
  if (state.completed === true || state.finalSubmission) return true;
  if (state.result && typeof state.result === "object") return true;
  if (state.submission && state.submission.status === "submitted") return true;
  return false;
}

function parseTime(value) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

export function reconcileActivityState(local, server) {
  const localState = local?.state || local || null;
  const serverState = server?.state || null;
  const localAt = parseTime(local?.updatedAt || localState?.updatedAt);
  const serverAt = parseTime(server?.updatedAt || serverState?.updatedAt);
  const localWork = activityStateHasWork(localState);
  const serverWork = activityStateHasWork(serverState);

  if (isCompletedActivityState(localState) && !serverWork) {
    return { state: localState, updatedAt: local?.updatedAt || localState?.updatedAt || null, source: "local" };
  }

  if (serverWork && (!localWork || serverAt >= localAt)) {
    return {
      state: serverState,
      updatedAt: server?.updatedAt || serverState?.updatedAt || null,
      source: "server"
    };
  }
  if (localWork) {
    return {
      state: localState,
      updatedAt: local?.updatedAt || localState?.updatedAt || null,
      source: "local",
      migrate: !serverWork || localAt > serverAt
    };
  }
  return { state: serverState || localState || null, updatedAt: server?.updatedAt || null, source: serverState ? "server" : "empty" };
}

export function activityStateCacheKey(activityKey, activityVersion, learnerKey) {
  return [
    ACTIVITY_STATE_CACHE_PREFIX,
    encodeURIComponent(learnerKey || "guest"),
    encodeURIComponent(activityKey),
    encodeURIComponent(activityVersion)
  ].join(":");
}

function readJson(storage, key) {
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(storage, key) {
  if (!storage || !key) return;
  try { storage.removeItem(key); } catch {}
}

function signedIn(auth) {
  return Boolean(auth && typeof auth.isSignedIn === "function" && auth.isSignedIn() === true);
}

function learnerCacheKey(auth) {
  try {
    const session = typeof auth?.getSession === "function" ? auth.getSession() : null;
    if (session?.user?.id) return `auth:${session.user.id}`;
  } catch {}
  if (signedIn(auth)) return "authenticated";
  return "guest";
}

function asRecord(row) {
  if (!row) return null;
  return {
    activityKey: row.activity_key || row.activityKey,
    activityVersion: row.activity_version || row.activityVersion,
    status: row.status || "in_progress",
    state: row.state || row.state_payload || {},
    startedAt: row.started_at || row.startedAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    completedAt: row.completed_at || row.completedAt || null
  };
}

function firstRow(result) {
  if (Array.isArray(result)) return result[0] || null;
  return result || null;
}

export function createActivityStateStore({
  api,
  auth = null,
  storage = null,
  hubCode = null,
  activityKey,
  activityVersion,
  debounceMs = 600,
  legacyKeys = [],
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)
} = {}) {
  const key = typeof activityKey === "string" ? activityKey.trim() : "";
  const version = canonicalActivityVersion(activityVersion);
  if (!key) throw new PlatformError({ code: "ACTIVITY_KEY_REQUIRED", category: "validation" });
  if (!version) throw new PlatformError({ code: "ACTIVITY_VERSION_REQUIRED", category: "validation" });

  let pendingTimer = null;
  let pendingState = null;
  let destroyed = false;

  function cacheKey() {
    return activityStateCacheKey(key, version, learnerCacheKey(auth));
  }

  function readLocal(preferred) {
    const candidates = [];
    if (preferred && typeof preferred === "object") candidates.push(preferred);
    const cached = readJson(storage, cacheKey());
    if (cached) candidates.push(cached);
    (Array.isArray(legacyKeys) ? legacyKeys : []).forEach((legacyKey) => {
      const stored = readJson(storage, legacyKey);
      if (stored) candidates.push(stored);
    });
    return candidates.reduce((best, item) => {
      if (!best) return item;
      const bestAt = parseTime(best.updatedAt);
      const itemAt = parseTime(item.updatedAt);
      if (itemAt > bestAt) return item;
      if (itemAt === bestAt && activityStateHasWork(item) && !activityStateHasWork(best)) return item;
      return best;
    }, null);
  }

  function writeLocal(state) {
    return writeJson(storage, cacheKey(), state);
  }

  async function pushServer(state) {
    if (!signedIn(auth) || typeof api?.saveActivityState !== "function") return null;
    const sanitized = sanitizeActivityState(state || {});
    const updatedAt = state?.updatedAt || new Date().toISOString();
    try {
      const saved = asRecord(firstRow(await api.saveActivityState({
        activityKey: key,
        activityVersion: version,
        state: sanitized,
        clientUpdatedAt: updatedAt,
        hubCode
      })));
      if (saved?.state) writeLocal({ ...saved.state, updatedAt: saved.updatedAt, startedAt: saved.startedAt });
      return saved;
    } catch (error) {
      writeLocal({ ...state, updatedAt, pendingSave: true });
      throw error;
    }
  }

  function cancelPending() {
    if (pendingTimer != null) {
      clearTimeoutFn(pendingTimer);
      pendingTimer = null;
    }
    pendingState = null;
  }

  function flush() {
    if (pendingTimer != null) {
      clearTimeoutFn(pendingTimer);
      pendingTimer = null;
    }
    if (!pendingState) return Promise.resolve(null);
    const next = pendingState;
    pendingState = null;
    return pushServer(next).catch(() => next);
  }

  function save(state, options = {}) {
    const stamped = {
      ...sanitizeActivityState(state || {}),
      updatedAt: new Date().toISOString()
    };
    writeLocal(stamped);
    if (!signedIn(auth)) return stamped;
    if (isCompletedActivityState(stamped) || options.remote === false) {
      cancelPending();
      if (isCompletedActivityState(stamped) && typeof api?.clearActivityState === "function") {
        api.clearActivityState({ activityKey: key, activityVersion: version }).catch(() => {});
      }
      return stamped;
    }
    pendingState = stamped;
    if (options.immediate) {
      flush();
      return stamped;
    }
    if (pendingTimer != null) clearTimeoutFn(pendingTimer);
    pendingTimer = setTimeoutFn(() => {
      pendingTimer = null;
      flush();
    }, Number.isFinite(options.debounceMs) ? options.debounceMs : debounceMs);
    return stamped;
  }

  async function hydrate(preferredLocal) {
    const local = readLocal(preferredLocal);
    if (!signedIn(auth) || typeof api?.getActivityState !== "function") {
      if (local) writeLocal(local);
      return local;
    }
    let server = null;
    try {
      server = asRecord(firstRow(await api.getActivityState({
        activityKey: key,
        activityVersion: version
      })));
    } catch {
      if (local) writeLocal(local);
      return local;
    }
    const resolved = reconcileActivityState(
      { state: local, updatedAt: local?.updatedAt },
      server ? { state: server.state, updatedAt: server.updatedAt } : null
    );
    if (resolved.state) {
      const next = {
        ...resolved.state,
        updatedAt: resolved.updatedAt || resolved.state.updatedAt || new Date().toISOString(),
        startedAt: resolved.state.startedAt || server?.startedAt || resolved.state.startedAt
      };
      writeLocal(next);
      if (resolved.migrate) {
        try { await pushServer(next); } catch {}
      }
      return next;
    }
    return null;
  }

  async function clear() {
    cancelPending();
    if (options.local !== false) {
      removeKey(storage, cacheKey());
      (Array.isArray(legacyKeys) ? legacyKeys : []).forEach((legacyKey) => removeKey(storage, legacyKey));
    }
    if (signedIn(auth) && typeof api?.clearActivityState === "function") {
      try {
        await api.clearActivityState({ activityKey: key, activityVersion: version });
      } catch {}
    }
  }

  function destroy() {
    destroyed = true;
    if (pendingTimer != null) clearTimeoutFn(pendingTimer);
  }

  if (typeof globalThis.addEventListener === "function") {
    const onHide = () => { if (!destroyed) flush(); };
    globalThis.addEventListener("pagehide", onHide);
    globalThis.addEventListener("beforeunload", onHide);
  }

  return Object.freeze({
    activityKey: key,
    activityVersion: version,
    cacheKey,
    hydrate,
    save,
    flush,
    clear,
    destroy,
    load: () => readLocal()
  });
}
