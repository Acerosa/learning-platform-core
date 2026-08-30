import { PlatformError, mapPlatformError } from "../errors/platform-error.js";
import { toApiResponse } from "../evidence/evidence.js";

const ALLOWED_FIELDS = Object.freeze([
  "activityKey",
  "activityVersion",
  "clientAttemptId",
  "responses",
  "sourcePage",
  "startedAt",
  "completedAt",
  "programmingLanguage"
]);

const FORBIDDEN_FIELD = /^(learner|learnerId|learner_id|student|studentId|student_id|studentNumber|student_number|firstName|first_name|surname|email|enrolment|enrolmentId|enrolment_id|assignment|assignmentId|assignment_id|attemptNumber|attempt_number|score|totalScore|total_score|maxScore|max_score|awarded_score|awardedScore|is_correct|isCorrect)$/i;

function requiredString(value, code) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) throw new PlatformError({ code, category: "validation" });
  return clean;
}

function timestamp(value, code) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new PlatformError({ code, category: "validation" });
  return date.toISOString();
}

function sourcePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  try {
    return new URL(raw, "https://hub.invalid").pathname;
  } catch {
    return raw.split(/[?#]/, 1)[0] || null;
  }
}

function storageKey(activityKey) {
  return `learning-platform.attempt.v1:${encodeURIComponent(activityKey)}`;
}

function generateUuid(runtimeCrypto) {
  if (typeof runtimeCrypto?.randomUUID === "function") return runtimeCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  runtimeCrypto?.getRandomValues?.(bytes);
  if (bytes.every((value) => value === 0)) {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function assertSecureSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlatformError({ code: "INVALID_SUBMISSION", category: "validation" });
  }
  Object.keys(input).forEach((key) => {
    if (FORBIDDEN_FIELD.test(key)) {
      throw new PlatformError({ code: "FORBIDDEN_SUBMISSION_FIELD", category: "submission", diagnostic: { field: key } });
    }
    if (!ALLOWED_FIELDS.includes(key)) {
      throw new PlatformError({ code: "UNRECOGNISED_SUBMISSION_FIELD", category: "submission", diagnostic: { field: key } });
    }
  });
  return true;
}

export function createSubmissionService({ api, storage = globalThis.sessionStorage, crypto = globalThis.crypto } = {}) {
  function getAttemptId(activityKey) {
    const key = storageKey(requiredString(activityKey, "ACTIVITY_KEY_REQUIRED"));
    try {
      const stored = storage?.getItem(key);
      if (typeof stored === "string" && stored.trim()) return stored.trim();
    } catch {}
    const attemptId = generateUuid(crypto);
    try { storage?.setItem(key, attemptId); } catch {}
    return attemptId;
  }

  function beginAttempt(activityKey) {
    const key = storageKey(requiredString(activityKey, "ACTIVITY_KEY_REQUIRED"));
    try { storage?.removeItem(key); } catch {}
    return getAttemptId(activityKey);
  }

  function buildPayload(input) {
    assertSecureSubmission(input);
    const activityKey = requiredString(input.activityKey, "ACTIVITY_KEY_REQUIRED");
    const activityVersion = requiredString(input.activityVersion, "ACTIVITY_VERSION_REQUIRED");
    if (!Array.isArray(input.responses) || input.responses.length === 0) {
      throw new PlatformError({ code: "RESPONSES_REQUIRED", category: "validation" });
    }
    return Object.freeze({
      p_activity_key: activityKey,
      p_activity_version: activityVersion,
      p_client_attempt_id: input.clientAttemptId
        ? requiredString(input.clientAttemptId, "CLIENT_ATTEMPT_ID_REQUIRED")
        : getAttemptId(activityKey),
      p_responses: Object.freeze(input.responses.map(toApiResponse)),
      p_source_page: sourcePath(input.sourcePage),
      p_started_at: timestamp(input.startedAt, "INVALID_STARTED_TIMESTAMP"),
      p_completed_at: timestamp(input.completedAt, "INVALID_COMPLETED_TIMESTAMP"),
      p_programming_language: typeof input.programmingLanguage === "string" && input.programmingLanguage.trim()
        ? input.programmingLanguage.trim()
        : null
    });
  }

  async function submit(input) {
    const payload = buildPayload(input);
    try {
      const result = await api.submitAttempt(payload);
      const key = storageKey(payload.p_activity_key);
      try {
        if (storage?.getItem(key) === payload.p_client_attempt_id) storage.removeItem(key);
      } catch {}
      return result;
    } catch (error) {
      throw mapPlatformError(error, { operation: "submit-attempt", category: "submission" });
    }
  }

  return Object.freeze({
    buildPayload,
    submit,
    getAttemptId,
    beginAttempt,
    allowedFields: ALLOWED_FIELDS
  });
}
