function sleep(ms, sleepFn) {
  return new Promise((resolve) => sleepFn(ms, resolve));
}

export async function withBoundedRetries(task, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const sleepFn = options.sleep || ((ms, done) => setTimeout(done, ms));
  const shouldRetry = typeof options.shouldRetry === "function"
    ? options.shouldRetry
    : (outcome) => Boolean(outcome?.retryable);

  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await task({ attempt, attempts });
    if (!shouldRetry(last) || attempt === attempts) {
      return { ...last, attempt, attempts };
    }
    if (delayMs > 0) await sleep(delayMs, sleepFn);
  }
  return { ...last, attempt: attempts, attempts };
}

export function isPropagationFailure(check) {
  if (!check || check.passed) return false;
  const id = String(check.id || "");
  return (
    id.startsWith("pages.html")
    || id.startsWith("pages.assets")
    || id.startsWith("pages.mime")
    || id.startsWith("pages.boot")
    || id === "pages.unreachable"
  );
}
