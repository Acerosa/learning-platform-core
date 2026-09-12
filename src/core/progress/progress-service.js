import { getOrCreateActivityStateStore } from "./activity-state.js";
import { canonicalActivityVersion } from "../security/hub-security-baseline.js";

function firstRow(result) {
  if (Array.isArray(result)) return result[0] || null;
  return result || null;
}

export function createProgressService(api, options = {}) {
  return Object.freeze({
    getProgress: (activityKey) => api.getProgress(activityKey),
    getAttempts: (activityKey) => api.getAttempts(activityKey),
    getResponses: (activityKey) => api.getResponses(activityKey),
    getActivityState: async (activityKey, activityVersion) => firstRow(
      await api.getActivityState({
        activityKey,
        activityVersion: canonicalActivityVersion(activityVersion)
      })
    ),
    saveActivityState: (activityKey, activityVersion, state, extras = {}) => api.saveActivityState({
      activityKey,
      activityVersion: canonicalActivityVersion(activityVersion),
      state,
      clientUpdatedAt: extras.clientUpdatedAt,
      hubCode: extras.hubCode ?? options.hubCode
    }),
    clearActivityState: (activityKey, activityVersion) => api.clearActivityState({
      activityKey,
      activityVersion: canonicalActivityVersion(activityVersion)
    }),
    createStore: (storeOptions = {}) => getOrCreateActivityStateStore({
      api,
      auth: options.auth,
      storage: storeOptions.storage ?? options.storage,
      hubCode: options.hubCode,
      debounceMs: storeOptions.debounceMs,
      legacyKeys: storeOptions.legacyKeys,
      setTimeoutFn: storeOptions.setTimeoutFn,
      clearTimeoutFn: storeOptions.clearTimeoutFn,
      activityKey: storeOptions.activityKey,
      activityVersion: storeOptions.activityVersion
    })
  });
}
