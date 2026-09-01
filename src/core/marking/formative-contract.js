import { PlatformError } from "../errors/platform-error.js";
import { resolveActivityVersion } from "../security/hub-security-baseline.js";

function requiredString(value, code) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) throw new PlatformError({ code, category: "validation" });
  return clean;
}

function freezeResponses(responses) {
  if (!Array.isArray(responses) || !responses.length) {
    throw new PlatformError({ code: "RESPONSES_REQUIRED", category: "validation" });
  }
  return Object.freeze(responses.map((item) => Object.freeze({ ...item })));
}

/**
 * Default hub behaviour: pass activity/version/question identifiers through unchanged.
 */
export function identityFormativeContract(input = {}) {
  return Object.freeze({
    activityKey: requiredString(input.activityKey, "ACTIVITY_KEY_REQUIRED"),
    activityVersion: requiredString(
      resolveActivityVersion({ version: input.activityVersion }),
      "ACTIVITY_VERSION_REQUIRED"
    ),
    responses: freezeResponses(input.responses)
  });
}

/**
 * Apply an optional hub resolver before the formative RPC payload is constructed.
 */
export async function applyFormativeContract(resolver, input = {}) {
  const base = identityFormativeContract(input);
  if (typeof resolver !== "function") return base;
  const resolved = await resolver({
    activityKey: base.activityKey,
    activityVersion: base.activityVersion,
    responses: base.responses
  });
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    throw new PlatformError({ code: "INVALID_FORMATIVE_CONTRACT", category: "configuration" });
  }
  return identityFormativeContract(resolved);
}
