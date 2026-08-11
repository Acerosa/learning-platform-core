import { PlatformError } from "../core/errors/platform-error.js";

export const THEME_MODES = Object.freeze(["light", "dark", "system"]);
export const THEME_EVENT = "learningplatform:themechange";

function safeStorage(value) {
  try { return value || null; } catch { return null; }
}

export function createThemeService({
  document: runtimeDocument = globalThis.document,
  window: runtimeWindow = globalThis.window,
  storage = safeStorage(globalThis.localStorage),
  storageKey = "learning-platform.theme.v1"
} = {}) {
  const media = runtimeWindow?.matchMedia?.("(prefers-color-scheme: dark)") || null;
  const listeners = new Set();
  let preference = readPreference();

  function readPreference() {
    try {
      const stored = storage?.getItem(storageKey);
      return THEME_MODES.includes(stored) ? stored : "system";
    } catch {
      return "system";
    }
  }

  function resolve(mode = preference) {
    if (mode === "light" || mode === "dark") return mode;
    return media?.matches ? "dark" : "light";
  }

  function snapshot() {
    return Object.freeze({ preference, resolvedTheme: resolve() });
  }

  function apply() {
    const state = snapshot();
    const root = runtimeDocument?.documentElement;
    if (root) {
      root.dataset.theme = state.resolvedTheme;
      root.dataset.themePreference = state.preference;
      root.style.colorScheme = state.resolvedTheme;
    }
    listeners.forEach((listener) => listener(state));
    if (runtimeDocument?.dispatchEvent && runtimeWindow?.CustomEvent) {
      runtimeDocument.dispatchEvent(new runtimeWindow.CustomEvent(THEME_EVENT, { detail: state }));
    }
    return state;
  }

  function setPreference(mode) {
    if (!THEME_MODES.includes(mode)) {
      throw new PlatformError({ code: "INVALID_THEME_MODE", category: "validation" });
    }
    preference = mode;
    try { storage?.setItem(storageKey, preference); } catch {}
    return apply();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  function systemChanged() {
    if (preference === "system") apply();
  }

  media?.addEventListener?.("change", systemChanged);
  if (!media?.addEventListener) media?.addListener?.(systemChanged);

  function destroy() {
    media?.removeEventListener?.("change", systemChanged);
    media?.removeListener?.(systemChanged);
    listeners.clear();
  }

  apply();
  return Object.freeze({
    getPreference: () => preference,
    getResolvedTheme: resolve,
    setPreference,
    apply,
    subscribe,
    destroy,
    storageKey,
    modes: THEME_MODES
  });
}

export function applyBranding(root, { primary, accent } = {}) {
  if (!root?.style) return;
  if (primary) root.style.setProperty("--hub-primary", primary);
  if (accent) root.style.setProperty("--hub-accent", accent);
}
