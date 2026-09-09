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

test("auth error codes map to learner-safe messages without revealing account existence", () => {
  const credentials = mapPlatformError(
    { code: "invalid_credentials", message: "Invalid login credentials" },
    { operation: "sign-in", category: "authentication" }
  );
  assert.equal(credentials.learnerMessage, "Email or password is incorrect.");
  assert.equal(credentials.learnerMessage.includes("Invalid login credentials"), false);

  const unconfirmed = mapPlatformError(
    { code: "email_not_confirmed", message: "Email not confirmed" },
    { operation: "sign-in", category: "authentication" }
  );
  assert.equal(unconfirmed.learnerMessage, "Confirm your email before signing in.");

  const rateLimited = mapPlatformError(
    { code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    { operation: "sign-up", category: "authentication" }
  );
  assert.equal(
    rateLimited.learnerMessage,
    "Too many account emails have been requested. Please wait a few minutes and try again."
  );
  assert.equal(rateLimited.category, "authentication");

  const unknownSignIn = mapPlatformError(
    { code: "unexpected_failure", message: "database host internal" },
    { operation: "sign-in", category: "authentication" }
  );
  assert.equal(unknownSignIn.learnerMessage, "We couldn't sign you in. Please try again.");

  const unknownSignUp = mapPlatformError(
    { code: "unexpected_failure", message: "database host internal" },
    { operation: "sign-up", category: "authentication" }
  );
  assert.equal(unknownSignUp.learnerMessage, "We couldn't create your account. Please try again.");
});

test("PostgREST SQLSTATE responses keep the API message code for learner copy", () => {
  const linked = mapPlatformError(
    { code: "23505", message: "STUDENT_NUMBER_ALREADY_LINKED", status: 409 },
    { operation: "complete-onboarding" }
  );
  assert.equal(linked.code, "STUDENT_NUMBER_ALREADY_LINKED");
  assert.equal(linked.category, "validation");
  assert.match(linked.learnerMessage, /already linked to another learning account/i);
  assert.equal(linked.learnerMessage.includes("Try again shortly"), false);

  const invalidKey = mapPlatformError(
    { code: "22023", message: "INVALID_CLASS_KEY", status: 400 },
    { operation: "join-class" }
  );
  assert.equal(invalidKey.code, "INVALID_CLASS_KEY");
  assert.match(invalidKey.learnerMessage, /registration key/i);
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
