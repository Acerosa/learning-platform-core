import test from "node:test";
import assert from "node:assert/strict";
import { createAuthStorageKey } from "../../src/core/auth/auth-storage-key.js";

const PROJECT_URL = "https://hubwpkrqndorznwzvaer.supabase.co";

test("auth storage keys are derived from project ref and canonical hub code", () => {
  assert.equal(
    createAuthStorageKey(PROJECT_URL, "tlevel-software-development"),
    "sb-hubwpkrqndorznwzvaer-auth-token--tlevel-software-development"
  );
  assert.equal(
    createAuthStorageKey(PROJECT_URL, "unit-3-cyber-security"),
    "sb-hubwpkrqndorznwzvaer-auth-token--unit-3-cyber-security"
  );
  assert.equal(
    createAuthStorageKey(`${PROJECT_URL}/`, "l2e-exploring-emerging-digital-technologies"),
    "sb-hubwpkrqndorznwzvaer-auth-token--l2e-exploring-emerging-digital-technologies"
  );
});

test("auth storage keys do not use display titles, emails, or learner identifiers", () => {
  const key = createAuthStorageKey(PROJECT_URL, "tlevel-software-development");
  assert.equal(key.includes("T Level"), false);
  assert.equal(key.includes("@"), false);
  assert.doesNotMatch(key, /[A-F0-9]{8}-[A-F0-9]{4}/i);
});

test("auth storage keys reject invalid project URLs and hub codes", () => {
  assert.throws(
    () => createAuthStorageKey("http://hubwpkrqndorznwzvaer.supabase.co", "tlevel-software-development"),
    (error) => error.code === "INVALID_SUPABASE_CONFIGURATION"
  );
  assert.throws(
    () => createAuthStorageKey(PROJECT_URL, "T Level Digital"),
    (error) => error.code === "INVALID_HUB_CODE"
  );
  assert.throws(
    () => createAuthStorageKey(PROJECT_URL, "learner@example.test"),
    (error) => error.code === "INVALID_HUB_CODE"
  );
});
