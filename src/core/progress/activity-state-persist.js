export const ACTIVITY_STATE_PERSIST_STATUS = Object.freeze({
  idle: "idle",
  saving: "saving",
  synced: "synced",
  pending: "pending",
  failed: "failed",
  retrievalFailed: "retrieval-failed"
});

export const ACTIVITY_STATE_SAVE_RETRY_BACKOFF_MS = Object.freeze([2000, 4000, 8000, 16000]);

export function persistStatusSnapshot({
  status = ACTIVITY_STATE_PERSIST_STATUS.idle,
  dirty = false,
  saving = false,
  retryPending = false,
  lastRemoteSaveSucceeded = null,
  remoteError = null
} = {}) {
  return Object.freeze({
    status,
    dirty: Boolean(dirty),
    saving: Boolean(saving),
    retryPending: Boolean(retryPending),
    lastRemoteSaveSucceeded,
    remoteError: remoteError ? String(remoteError) : null
  });
}
