export const REQUEST_CATEGORIES = Object.freeze([
  "AUTH_BOOTSTRAP",
  "CURRICULUM",
  "ASSIGNMENTS",
  "GET_ACTIVITY_STATE",
  "SAVE_ACTIVITY_STATE",
  "SUBMIT_ATTEMPT",
  "PROGRESS",
  "REALTIME",
  "ADMIN",
  "OTHER"
]);

const AUTH_BOOTSTRAP_OPS = new Set([
  "getUser",
  "signIn",
  "signUp",
  "signOut",
  "refreshSession",
  "ensure_learner_auth_link",
  "my_profile",
  "my_enrolments",
  "resolve_learner_hub_access",
  "complete_learner_onboarding",
  "join_learner_hub_group",
  "registration_options"
]);

const CURRICULUM_OPS = new Set(["published_curriculum", "published_curriculum_package"]);
const ASSIGNMENT_OPS = new Set(["my_hub_assignments", "my_assignments", "my_activity_delivery"]);
const PROGRESS_OPS = new Set(["my_activity_progress", "my_attempts", "my_responses", "mark_formative_response"]);
const REALTIME_OPS = new Set(["setAuth", "channel.subscribe", "channel.unsubscribe"]);

function emptyCounts() {
  const counts = { TOTAL: 0 };
  REQUEST_CATEGORIES.forEach((category) => {
    counts[category] = 0;
  });
  return counts;
}

let counts = emptyCounts();
let operations = [];
let debugEnabled = false;
let debugSink = null;

export function categorizePlatformRequest(kind, name) {
  const op = String(name || "");
  if (kind === "admin" || op.startsWith("list_hub_learning") || op.startsWith("summarise_hub_learning")
    || op.startsWith("admin_api.") || op.startsWith("get_grouping_session")) {
    return "ADMIN";
  }
  if (kind === "realtime" || REALTIME_OPS.has(op)) return "REALTIME";
  if (kind === "auth" || AUTH_BOOTSTRAP_OPS.has(op)) return "AUTH_BOOTSTRAP";
  if (CURRICULUM_OPS.has(op)) return "CURRICULUM";
  if (ASSIGNMENT_OPS.has(op)) return "ASSIGNMENTS";
  if (op === "get_activity_state") return "GET_ACTIVITY_STATE";
  if (op === "save_activity_state" || op === "clear_activity_state") return "SAVE_ACTIVITY_STATE";
  if (op === "submit_attempt") return "SUBMIT_ATTEMPT";
  if (PROGRESS_OPS.has(op)) return "PROGRESS";
  return "OTHER";
}

/**
 * Record one logical Supabase operation. Stores category + operation name only.
 * Never records tokens, payloads, learner identity, or evidence.
 */
export function recordPlatformRequest(kind, name) {
  const operation = String(name || "unknown");
  const category = categorizePlatformRequest(kind, operation);
  counts[category] += 1;
  counts.TOTAL += 1;
  if (operations.length < 500) {
    operations.push(Object.freeze({ category, operation, kind: String(kind || "rpc") }));
  }
  if (debugEnabled && typeof debugSink === "function") {
    debugSink({ category, operation, kind: String(kind || "rpc") });
  }
}

export function snapshotPlatformRequests() {
  return Object.freeze({
    counts: Object.freeze({ ...counts }),
    operations: Object.freeze(operations.slice())
  });
}

export function resetPlatformRequests() {
  counts = emptyCounts();
  operations = [];
}

export function enablePlatformRequestDebug(sink) {
  debugEnabled = true;
  debugSink = typeof sink === "function" ? sink : null;
}

export function disablePlatformRequestDebug() {
  debugEnabled = false;
  debugSink = null;
}
