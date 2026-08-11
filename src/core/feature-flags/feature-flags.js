export function createFeatureFlags(initial = {}) {
  let flags = Object.freeze(normalise(initial));
  let listeners = new Set();

  function normalise(value) {
    return Object.fromEntries(
      Object.entries(value || {}).map(([key, enabled]) => [key, Boolean(enabled)])
    );
  }

  function snapshot() {
    return flags;
  }

  function set(next) {
    flags = Object.freeze({ ...flags, ...normalise(next) });
    listeners.forEach((listener) => listener(flags));
    return flags;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener(flags);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    isEnabled: (name) => flags[name] === true,
    getAll: snapshot,
    set,
    subscribe
  });
}
