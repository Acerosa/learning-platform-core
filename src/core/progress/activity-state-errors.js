/**
 * Classify activity-state RPC failures so permanent identity/auth errors never
 * enter an unbounded retry storm, while transient transport faults may retry
 * with bounded exponential backoff.
 */

export const ACTIVITY_STATE_TRANSIENT_MAX_ATTEMPTS = 4;
export const ACTIVITY_STATE_TRANSIENT_BACKOFF_MS = Object.freeze([500, 1000, 2000, 4000]);

export const LEARNER_IDENTITY_ERROR_CODES = Object.freeze([
  "STUDENT_IDENTITY_NOT_FOUND",
  "AUTHENTICATION_REQUIRED",
  "AUTH_REQUIRED",
  "PROFILE_REQUIRED"
]);

const IDENTITY_CODE = /STUDENT_IDENTITY_NOT_FOUND|AUTHENTICATION_REQUIRED|AUTH_REQUIRED|PROFILE_REQUIRED/i;
const TRANSIENT_HINT = /NETWORK|FETCH|TIMEOUT|ABORT|OFFLINE|ECONNRESET|ETIMEDOUT|429|502|503|504|500/i;

export const LEARNER_IDENTITY_MESSAGE =
  "We couldn’t connect your learner account. Your sign-in was successful, but your learner profile could not be loaded. Try refreshing the page once. If the problem continues, ask your tutor for help.";

function errorText(error) {
  return [
    error?.code,
    error?.message,
    error?.learnerMessage,
    error?.details,
    error?.hint,
    error?.diagnostic?.sourceCode
  ].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

export function activityStateErrorCode(error) {
  const candidates = [
    error?.code,
    error?.diagnostic?.sourceCode,
    error?.message
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (/^[A-Z][A-Z0-9_]+$/.test(value)) return value;
    const match = value.match(/\b(STUDENT_IDENTITY_NOT_FOUND|AUTHENTICATION_REQUIRED|AUTH_REQUIRED|PROFILE_REQUIRED)\b/);
    if (match) return match[1];
  }
  return "";
}

export function isLearnerIdentityError(error) {
  const code = activityStateErrorCode(error);
  if (LEARNER_IDENTITY_ERROR_CODES.includes(code)) return true;
  return IDENTITY_CODE.test(errorText(error));
}

export function classifyActivityStateError(error) {
  if (!error) return "unknown";
  const status = Number(error?.status ?? error?.diagnostic?.status);
  if (status === 401 || status === 403) return "permanent";
  if (isLearnerIdentityError(error)) return "permanent";
  if (status === 429 || (status >= 500 && status <= 599) || status === 0) return "transient";
  if (TRANSIENT_HINT.test(errorText(error))) return "transient";
  // Generic failures (tests, unexpected) stay retryable without permanent lock.
  return "transient";
}

export function transientBackoffMs(attemptIndex, schedule = ACTIVITY_STATE_TRANSIENT_BACKOFF_MS) {
  const index = Math.max(0, Math.min(Number(attemptIndex) || 0, schedule.length - 1));
  const base = schedule[index] || schedule[schedule.length - 1] || 500;
  const jitter = Math.floor(Math.random() * Math.max(50, Math.floor(base * 0.2)));
  return base + jitter;
}

export function sleep(ms, setTimeoutFn = globalThis.setTimeout.bind(globalThis)) {
  return new Promise((resolve) => setTimeoutFn(resolve, Math.max(0, Number(ms) || 0)));
}
