const SECRET_KEYS = /password|passcode|token|secret|authorization|apikey|api_key|service.?role|cookie|session/i;
const PII_KEYS = /email|student|learner|first.?name|surname|full.?name|display.?name|contact/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 100 });

function redactString(value) {
  return String(value)
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
}

export function redact(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactString(value);
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, seen));

  const output = {};
  Object.entries(value).slice(0, 40).forEach(([key, item]) => {
    if (SECRET_KEYS.test(key) || PII_KEYS.test(key)) {
      output[key] = "[REDACTED]";
    } else if (item instanceof Error) {
      output[key] = { name: item.name, code: item.code || null };
    } else {
      output[key] = redact(item, seen);
    }
  });
  return output;
}

export function createLogger({ sink = globalThis.console, level = "warn", context = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.warn;

  function write(method, event, details) {
    if ((LEVELS[method] ?? LEVELS.error) < threshold) return;
    const target = sink?.[method] || sink?.log;
    if (typeof target !== "function") return;
    target.call(sink, `[learning-platform] ${redactString(event)}`, redact({ ...context, ...details }));
  }

  return Object.freeze({
    debug: (event, details = {}) => write("debug", event, details),
    info: (event, details = {}) => write("info", event, details),
    warn: (event, details = {}) => write("warn", event, details),
    error: (event, details = {}) => write("error", event, details),
    child: (extra = {}) => createLogger({ sink, level, context: { ...context, ...extra } })
  });
}
