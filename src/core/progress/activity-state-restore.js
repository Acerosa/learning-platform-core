import { canonicalActivityVersion } from "../security/hub-security-baseline.js";

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function parseTime(value) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function rowActivityKey(row) {
  return String(row?.activity_key || row?.activityKey || "");
}

function rowActivityVersion(row) {
  return canonicalActivityVersion(row?.activity_version || row?.activityVersion || "");
}

function rowAttemptId(row) {
  return String(row?.attempt_id || row?.attemptId || row?.id || "");
}

function unwrapUiValue(payload) {
  if (payload == null) return payload;
  if (typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload;
  if (typeof payload.optionId === "string") return payload.optionId;
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.sourceCode === "string") return payload.sourceCode;
  if (Array.isArray(payload.optionIds)) return payload.optionIds;
  if (Array.isArray(payload.itemIds)) return payload.itemIds;
  if (Array.isArray(payload.pairs)) return payload;
  return payload;
}

function applyResponseRow(responses, checked, row) {
  const questionKey = String(row?.question_key || row?.questionKey || row?.question_id || row?.questionId || "").trim();
  if (!questionKey) return;
  const payload = row?.response_payload !== undefined ? row.response_payload : row?.responsePayload;
  const colon = questionKey.indexOf(":");
  if (colon > 0 && payload && typeof payload === "object" && !Array.isArray(payload) && payload.categoryId) {
    const parent = questionKey.slice(0, colon);
    const itemId = String(payload.itemId || questionKey.slice(colon + 1));
    const current = responses[parent] && typeof responses[parent] === "object" && !Array.isArray(responses[parent])
      ? { ...responses[parent] }
      : {};
    current[itemId] = payload.categoryId;
    responses[parent] = current;
    checked[parent] = true;
    return;
  }
  responses[questionKey] = unwrapUiValue(payload);
  checked[questionKey] = true;
}

export function pickLatestCompletedAttempt(attempts, activityKey, activityVersion) {
  const version = canonicalActivityVersion(activityVersion);
  const key = String(activityKey || "");
  const rows = asList(attempts).filter((row) => {
    if (rowActivityKey(row) !== key) return false;
    if (rowActivityVersion(row) !== version) return false;
    return String(row?.status || "").toLowerCase() === "completed";
  });
  rows.sort((left, right) => {
    const rightAt = parseTime(right.received_at || right.receivedAt || right.completed_at || right.completedAt);
    const leftAt = parseTime(left.received_at || left.receivedAt || left.completed_at || left.completedAt);
    return rightAt - leftAt;
  });
  return rows[0] || null;
}

export function reconstructCompletedAttemptState(attempt, responses) {
  if (!attempt) return null;
  const attemptId = rowAttemptId(attempt);
  const mapped = {};
  const checked = {};
  asList(responses)
    .filter((row) => !attemptId || rowAttemptId(row) === attemptId)
    .forEach((row) => applyResponseRow(mapped, checked, row));
  if (!Object.keys(mapped).length) return null;
  const completedAt = attempt.completed_at || attempt.completedAt || attempt.received_at || attempt.receivedAt || null;
  const startedAt = attempt.client_started_at || attempt.clientStartedAt || attempt.received_at || attempt.receivedAt || null;
  return {
    responses: mapped,
    checked,
    completed: true,
    submission: { status: "submitted" },
    restoreSource: "completed-attempt",
    startedAt,
    completedAt,
    updatedAt: completedAt || startedAt || new Date().toISOString()
  };
}

export async function readCompletedAttemptSnapshot(api, activityKey, activityVersion) {
  if (!api || typeof api.getAttempts !== "function") return null;
  const attempt = pickLatestCompletedAttempt(
    await api.getAttempts(activityKey),
    activityKey,
    activityVersion
  );
  if (!attempt) return null;
  const attemptId = rowAttemptId(attempt);
  let rows = [];
  if (typeof api.getResponses === "function") {
    try {
      rows = asList(await api.getResponses({ attemptId, activityKey }));
    } catch {
      rows = asList(await api.getResponses(activityKey));
    }
  }
  const snapshot = reconstructCompletedAttemptState(attempt, rows);
  if (!snapshot) return null;
  return {
    state: snapshot,
    updatedAt: snapshot.updatedAt,
    completedAt: snapshot.completedAt,
    source: "completed-attempt"
  };
}

export function isCompletedAttemptSnapshot(state) {
  return Boolean(state && state.restoreSource === "completed-attempt");
}
