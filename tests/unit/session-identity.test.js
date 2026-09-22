import assert from "node:assert/strict";
import test from "node:test";
import { waitForSessionIdentity } from "../../src/core/auth/session-identity.js";

test("waitForSessionIdentity is immediately not-ready when Auth is not wired", async () => {
  const started = Date.now();
  const result = await waitForSessionIdentity(null, { timeoutMs: 8000 });
  assert.equal(result.ready, false);
  assert.equal(result.pending, false);
  assert.ok(Date.now() - started < 50);
});

test("unsigned loading without a session does not wait as restore", async () => {
  const started = Date.now();
  const result = await waitForSessionIdentity({
    isSignedIn: () => false,
    getSession: () => null,
    getState: () => ({ status: "loading" })
  }, { timeoutMs: 8000 });
  assert.equal(result.ready, false);
  assert.equal(result.pending, false);
  assert.ok(Date.now() - started < 50);
});

test("signed-in without a user id waits until the session is ready", async () => {
  let ready = false;
  const resultPromise = waitForSessionIdentity({
    isSignedIn: () => true,
    getSession: () => (ready ? { user: { id: "learner-1" } } : { user: null }),
    getState: () => ({ status: "loading" })
  }, {
    timeoutMs: 1000,
    setTimeoutFn: (fn, wait) => setTimeout(fn, Math.min(Number(wait) || 0, 20))
  });
  setTimeout(() => { ready = true; }, 30);
  const result = await resultPromise;
  assert.equal(result.ready, true);
  assert.equal(result.pending, false);
});
