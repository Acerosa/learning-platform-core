import test from "node:test";
import assert from "node:assert/strict";
import { ERROR_CATEGORIES, PlatformError, mapPlatformError } from "../../src/core/errors/platform-error.js";
import { createLogger, redact } from "../../src/core/logging/logger.js";

test("platform errors use stable categories and learner-safe messages", () => {
  assert.deepEqual(ERROR_CATEGORIES, [
    "authentication", "authorisation", "validation", "network",
    "submission", "configuration", "platform", "unexpected"
  ]);
  const mapped = mapPlatformError({ code: "NETWORK_ERROR", message: "database host internal" });
  assert.equal(mapped.category, "network");
  assert.equal(mapped.learnerMessage.includes("database"), false);
  assert.deepEqual(mapped.toJSON(), {
    code: "NETWORK_ERROR",
    category: "network",
    learnerMessage: mapped.learnerMessage
  });
});

test("PlatformError never serialises diagnostics to the learner contract", () => {
  const error = new PlatformError({ code: "TEST", category: "platform", diagnostic: { table: "private.students" } });
  assert.equal(JSON.stringify(error).includes("private.students"), false);
});

test("logger redacts credentials and learner PII", () => {
  const safe = redact({
    email: "learner@example.test",
    studentNumber: "000123",
    authorization: "Bearer secret-token",
    nested: { message: "Contact learner@example.test", count: 2 }
  });
  assert.equal(safe.email, "[REDACTED]");
  assert.equal(safe.studentNumber, "[REDACTED]");
  assert.equal(safe.authorization, "[REDACTED]");
  assert.equal(safe.nested.message.includes("learner@example.test"), false);
});

test("logger supports a monitoring sink without dumping raw objects", () => {
  const entries = [];
  const sink = { warn: (...args) => entries.push(args) };
  createLogger({ sink, level: "warn" }).warn("submission failed for user@example.test", { token: "abc", code: "NETWORK_ERROR" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0][0].includes("user@example.test"), false);
  assert.equal(entries[0][1].token, "[REDACTED]");
});
