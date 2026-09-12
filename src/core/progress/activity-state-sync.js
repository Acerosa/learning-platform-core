import {
  ACTIVITY_STATE_INVALIDATION_EVENT,
  activityStateSyncTopic,
  getRegisteredActivityStateStore,
  listRegisteredActivityStateStores,
  learnerCacheKey,
  resetActivityStateDedupe
} from "./activity-state.js";

function userIdFromAuth(auth) {
  try {
    const session = typeof auth?.getSession === "function" ? auth.getSession() : null;
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export function createActivityStateSync({
  client,
  auth,
  getStore = getRegisteredActivityStateStore,
  listStores = listRegisteredActivityStateStores,
  coalesceMs
} = {}) {
  let channel = null;
  let currentUserId = null;
  let hasSubscribed = false;
  let reconnectPending = false;
  let reconcileInFlight = false;

  function learnerKey() {
    return learnerCacheKey(auth);
  }

  function handlePayload(payload) {
    if (!payload || typeof payload !== "object") return;
    const activityId = payload.activityId || payload.activity_id;
    const version = payload.version || payload.activityVersion;
    if (!activityId) return;
    const store = getStore(learnerKey(), activityId, version);
    if (!store || typeof store.handleRemoteInvalidation !== "function") return;
    store.handleRemoteInvalidation(payload, { coalesceMs });
  }

  async function reconcileOnce() {
    if (reconcileInFlight) return;
    reconcileInFlight = true;
    try {
      const stores = listStores();
      await Promise.all(stores.map((store) => {
        if (!store || typeof store.handleRemoteInvalidation !== "function") return null;
        if (typeof store.isDirty === "function" && store.isDirty()) return null;
        return store.handleRemoteInvalidation({
          activityId: store.activityKey
        }, { coalesceMs: 0, force: true });
      }));
    } finally {
      reconcileInFlight = false;
    }
  }

  async function stop() {
    const current = channel;
    channel = null;
    currentUserId = null;
    hasSubscribed = false;
    reconnectPending = false;
    if (!current) return;
    try {
      if (typeof client?.removeChannel === "function") await client.removeChannel(current);
      else if (typeof current.unsubscribe === "function") await current.unsubscribe();
    } catch {}
  }

  async function start() {
    const userId = userIdFromAuth(auth);
    if (!userId || typeof client?.channel !== "function") return;
    if (channel && currentUserId === userId) {
      if (typeof client.realtime?.setAuth === "function") {
        try { await client.realtime.setAuth(); } catch {}
      }
      return;
    }
    await stop();
    currentUserId = userId;
    if (typeof client.realtime?.setAuth === "function") {
      try { await client.realtime.setAuth(); } catch {}
    }
    const topic = activityStateSyncTopic(userId);
    const next = client.channel(topic, { config: { private: true } });
    if (!next || typeof next.on !== "function" || typeof next.subscribe !== "function") return;
    channel = next;
    next.on("broadcast", { event: ACTIVITY_STATE_INVALIDATION_EVENT }, (message) => {
      handlePayload(message?.payload || message);
    });
    next.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (hasSubscribed && reconnectPending) {
          reconnectPending = false;
          void reconcileOnce();
        }
        hasSubscribed = true;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (hasSubscribed) reconnectPending = true;
      }
    });
  }

  return Object.freeze({
    start,
    stop,
    handlePayload,
    reconcileOnce,
    reset: async () => {
      await stop();
      resetActivityStateDedupe();
    },
    currentTopic: () => (currentUserId ? activityStateSyncTopic(currentUserId) : null)
  });
}
