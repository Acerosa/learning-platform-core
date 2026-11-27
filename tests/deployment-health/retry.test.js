import assert from "node:assert/strict";
import test from "node:test";
import { withBoundedRetries } from "../../src/deployment-health/retry.js";

test("withBoundedRetries retries retryable failures then returns last outcome", async () => {
  const sleeps = [];
  let calls = 0;
  const outcome = await withBoundedRetries(async () => {
    calls += 1;
    return { retryable: calls < 3, value: calls };
  }, {
    attempts: 5,
    delayMs: 1,
    sleep: (ms, done) => {
      sleeps.push(ms);
      done();
    }
  });
  assert.equal(calls, 3);
  assert.equal(outcome.value, 3);
  assert.equal(outcome.attempt, 3);
  assert.deepEqual(sleeps, [1, 1]);
});
