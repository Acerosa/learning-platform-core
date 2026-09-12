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

const TRANSIENT_PERSIST_KEYS = new Set([
  "updatedAt",
  "startedAt",
  "completedAt",
  "pendingSave",
  "cachedAt",
  "clientUpdatedAt"
]);

export const ACTIVITY_STATE_INVALIDATION_EVENT = "activity_state_invalidated";
export const ACTIVITY_STATE_INVALIDATION_COALESCE_MS = 50;

const inflightReads = new Map();
const completedReads = new Set();
const writeFingerprints = new Map();
const storeRegistry = new Map();
let activeLearnerKey = null;

export function activityStateSyncTopic(userId) {
  return `learner-state:${String(userId || "")}`;
}

export function activityStateReadKey(learnerKey, activityKey, activityVersion) {
  return [
    String(learnerKey || "guest"),
    String(activityKey || ""),
    String(activityVersion || "")
  ].join("|");
}

function canonicalPersistable(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalPersistable(item));
  if (!value || typeof value !== "object") return value;
  const next = {};
  Object.keys(value).sort().forEach((key) => {
    if (TRANSIENT_PERSIST_KEYS.has(key)) return;
    next[key] = canonicalPersistable(value[key]);
  });
  return next;
}

export function persistableActivityStateFingerprint(state) {
  return JSON.stringify(canonicalPersistable(sanitizeActivityState(state || {})));
}

function clearStoreRegistry() {
  [...storeRegistry.values()].forEach((store) => {
    try { store.destroy(); } catch {}
  });
  storeRegistry.clear();
}

export function resetActivityStateDedupe() {
  inflightReads.clear();
  completedReads.clear();
  writeFingerprints.clear();
  activeLearnerKey = null;
  clearStoreRegistry();
}

function syncLearnerDedupeScope(auth) {
  const current = learnerCacheKey(auth);
  if (activeLearnerKey && activeLearnerKey !== current) {
    inflightReads.clear();
    completedReads.clear();
    writeFingerprints.clear();
    const prefix = `${current}|`;
    [...storeRegistry.entries()].forEach(([key, store]) => {
      if (!key.startsWith(prefix)) {
        try { store.destroy(); } catch {}
        storeRegistry.delete(key);
      }
    });
  }
  activeLearnerKey = current;
}

export function getOrCreateActivityStateStore(options = {}) {
  const activityKey = typeof options.activityKey === "string" ? options.activityKey.trim() : "";
  const activityVersion = canonicalActivityVersion(options.activityVersion);
  const key = activityStateReadKey(learnerCacheKey(options.auth), activityKey, activityVersion);
  const existing = storeRegistry.get(key);
  if (existing) return existing;
  const store = createActivityStateStore(options);
  storeRegistry.set(key, store);
  return store;
}

export function getRegisteredActivityStateStore(learnerKey, activityKey, activityVersion) {
  const canonical = canonicalActivityVersion(activityVersion);
  return storeRegistry.get(activityStateReadKey(learnerKey, activityKey, canonical))
    || (activityVersion && String(activityVersion) !== canonical
      ? storeRegistry.get(activityStateReadKey(learnerKey, activityKey, String(activityVersion)))
      : null)
    || null;
}

export function listRegisteredActivityStateStores() {
  return [...storeRegistry.values()];
}

export function invalidateActivityStateReads(filter = {}) {
  const learnerKey = filter.learnerKey;
  const activityKey = filter.activityKey;
  const activityVersion = filter.activityVersion;
  if (!learnerKey && !activityKey && !activityVersion) {
    resetActivityStateDedupe();
    return;
  }
  const matches = (key) => {
    const [learner, activity, version] = String(key).split("|");
    if (learnerKey && learner !== String(learnerKey)) return false;
    if (activityKey && activity !== String(activityKey)) return false;
    if (activityVersion && version !== String(activityVersion)) return false;
    return true;
  };
  [...completedReads].forEach((key) => {
    if (matches(key)) completedReads.delete(key);
  });
  [...inflightReads.keys()].forEach((key) => {
    if (matches(key)) inflightReads.delete(key);
  });
  [...writeFingerprints.keys()].forEach((key) => {
    if (matches(key)) writeFingerprints.delete(key);
  });
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

export function learnerCacheKey(auth) {
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
    completedAt: row.completed_at || row.completedAt || null,
    revision: Number(row.revision) || 0
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

  const registryKey = activityStateReadKey(learnerCacheKey(auth), key, version);
  let pendingTimer = null;
  let pendingState = null;
  let destroyed = false;
  let dirty = false;
  let knownRevision = 0;
  let knownUpdatedAt = 0;
  let pendingRemoteRevision = 0;
  let coalesceTimer = null;
  let coalesceResolvers = [];
  const listeners = new Set();

  function cacheKey() {
    return activityStateCacheKey(key, version, learnerCacheKey(auth));
  }

  function readDedupeKey() {
    return activityStateReadKey(learnerCacheKey(auth), key, version);
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

  function rememberPersisted(record) {
    if (!record) return;
    const revision = Number(record.revision) || 0;
    if (revision > knownRevision) knownRevision = revision;
    const updated = parseTime(record.updatedAt);
    if (updated > knownUpdatedAt) knownUpdatedAt = updated;
    if (record.state) {
      writeFingerprints.set(readDedupeKey(), persistableActivityStateFingerprint(record.state));
    }
  }

  function isDirty() {
    return dirty || pendingState != null || pendingTimer != null;
  }

  function markDirty() {
    if (destroyed) return;
    dirty = true;
  }

  function eventIsCurrentOrOlder(event = {}) {
    const revision = Number(event.revision) || 0;
    if (revision && knownRevision && revision <= knownRevision) return true;
    const updated = parseTime(event.updatedAt);
    if (!revision && updated && knownUpdatedAt && updated <= knownUpdatedAt) return true;
    return false;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notifyRemote(state) {
    listeners.forEach((listener) => {
      try { listener(state); } catch {}
    });
  }

  function maybeApplyDeferredRemote() {
    const pending = pendingRemoteRevision;
    if (!pending || isDirty()) return;
    if (pending <= knownRevision) {
      pendingRemoteRevision = 0;
      return;
    }
    pendingRemoteRevision = 0;
    handleRemoteInvalidation({ revision: pending });
  }

  function handleRemoteInvalidation(event = {}, options = {}) {
    if (destroyed) return Promise.resolve(null);
    const force = Boolean(options.force || event.force);
    if (!force && eventIsCurrentOrOlder(event)) return Promise.resolve(null);
    const revision = Number(event.revision) || 0;
    if (revision > pendingRemoteRevision) pendingRemoteRevision = revision;
    if (isDirty()) return Promise.resolve(null);
    const wait = Number.isFinite(options.coalesceMs)
      ? options.coalesceMs
      : ACTIVITY_STATE_INVALIDATION_COALESCE_MS;
    return new Promise((resolve) => {
      coalesceResolvers.push(resolve);
      if (coalesceTimer != null) clearTimeoutFn(coalesceTimer);
      coalesceTimer = setTimeoutFn(() => {
        coalesceTimer = null;
        const resolvers = coalesceResolvers;
        coalesceResolvers = [];
        void applyRemoteInvalidation(event, { force }).then((result) => {
          resolvers.forEach((fn) => fn(result));
        }, () => {
          resolvers.forEach((fn) => fn(null));
        });
      }, wait);
    });
  }

  async function applyRemoteInvalidation(event, applyOptions = {}) {
    if (destroyed || isDirty()) return null;
    if (!applyOptions.force && eventIsCurrentOrOlder(event) && pendingRemoteRevision <= knownRevision) {
      pendingRemoteRevision = 0;
      return null;
    }
    invalidateActivityStateReads({
      learnerKey: learnerCacheKey(auth),
      activityKey: key,
      activityVersion: version
    });
    const applied = await hydrate(null, { fresh: true, remote: true });
    pendingRemoteRevision = 0;
    return applied;
  }

  async function pushServer(state) {
    if (!signedIn(auth) || typeof api?.saveActivityState !== "function") return null;
    syncLearnerDedupeScope(auth);
    const sanitized = sanitizeActivityState(state || {});
    const updatedAt = state?.updatedAt || new Date().toISOString();
    const dedupeKey = readDedupeKey();
    const fingerprint = persistableActivityStateFingerprint(sanitized);
    if (writeFingerprints.get(dedupeKey) === fingerprint) {
      return {
        activityKey: key,
        activityVersion: version,
        status: "in_progress",
        state: sanitized,
        startedAt: state?.startedAt || null,
        updatedAt,
        completedAt: state?.completedAt || null
      };
    }
    try {
      const saved = asRecord(firstRow(await api.saveActivityState({
        activityKey: key,
        activityVersion: version,
        state: sanitized,
        clientUpdatedAt: updatedAt,
        hubCode
      })));
      writeFingerprints.set(dedupeKey, fingerprint);
      rememberPersisted(saved);
      dirty = false;
      if (saved?.state) writeLocal({ ...saved.state, updatedAt: saved.updatedAt, startedAt: saved.startedAt });
      maybeApplyDeferredRemote();
      return saved;
    } catch (error) {
      writeFingerprints.delete(dedupeKey);
      dirty = true;
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
    syncLearnerDedupeScope(auth);
    const sanitized = sanitizeActivityState(state || {});
    const fingerprint = persistableActivityStateFingerprint(sanitized);
    const stamped = {
      ...sanitized,
      updatedAt: new Date().toISOString()
    };
    writeLocal(stamped);
    const unchanged = writeFingerprints.get(readDedupeKey()) === fingerprint;
    if (!unchanged) dirty = true;
    if (!signedIn(auth) || options.remote === false) {
      if (options.remote === false) cancelPending();
      return stamped;
    }
    if (unchanged) {
      cancelPending();
      dirty = false;
      maybeApplyDeferredRemote();
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

  async function hydrate(preferredLocal, options = {}) {
    const local = readLocal(preferredLocal);
    syncLearnerDedupeScope(auth);
    if (!signedIn(auth) || typeof api?.getActivityState !== "function") {
      if (local) writeLocal(local);
      return local;
    }
    const fresh = Boolean(options && options.fresh);
    const dedupeKey = readDedupeKey();
    if (fresh) completedReads.delete(dedupeKey);
    else if (completedReads.has(dedupeKey)) {
      return local;
    }

    if (inflightReads.has(dedupeKey)) {
      try {
        await inflightReads.get(dedupeKey);
      } catch {
        /* first request failed; retry below unless it completed */
      }
      if (!fresh && completedReads.has(dedupeKey)) {
        return readLocal(preferredLocal);
      }
    }

    const pending = (async () => {
      let server = null;
      try {
        server = asRecord(firstRow(await api.getActivityState({
          activityKey: key,
          activityVersion: version
        })));
      } catch (error) {
        throw error;
      }
      completedReads.add(dedupeKey);
      if (server) rememberPersisted(server);
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
        if (resolved.source === "server") dirty = false;
        if (resolved.migrate) {
          try { await pushServer(next); } catch {}
        }
        if (options.remote && resolved.source === "server") notifyRemote(next);
        return next;
      }
      return null;
    })();

    inflightReads.set(dedupeKey, pending);
    try {
      return await pending;
    } catch {
      if (local) writeLocal(local);
      return local;
    } finally {
      if (inflightReads.get(dedupeKey) === pending) inflightReads.delete(dedupeKey);
    }
  }

  async function clear(clearOptions = {}) {
    cancelPending();
    invalidateActivityStateReads({
      learnerKey: learnerCacheKey(auth),
      activityKey: key,
      activityVersion: version
    });
    dirty = false;
    knownRevision = 0;
    knownUpdatedAt = 0;
    pendingRemoteRevision = 0;
    if (clearOptions.local !== false) {
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
    if (coalesceTimer != null) {
      clearTimeoutFn(coalesceTimer);
      coalesceTimer = null;
      const resolvers = coalesceResolvers;
      coalesceResolvers = [];
      resolvers.forEach((fn) => fn(null));
    }
    listeners.clear();
    storeRegistry.delete(registryKey);
    if (typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("pagehide", onHide);
      globalThis.removeEventListener("beforeunload", onHide);
    }
  }

  const onHide = () => { if (!destroyed) flush(); };
  if (typeof globalThis.addEventListener === "function") {
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
    subscribe,
    handleRemoteInvalidation,
    isDirty,
    markDirty,
    knownRevision: () => knownRevision,
    pendingRemoteRevision: () => pendingRemoteRevision,
    load: () => readLocal()
  });
}
