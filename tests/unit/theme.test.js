import test from "node:test";
import assert from "node:assert/strict";
import { createThemeService, THEME_EVENT } from "../../src/theme/theme.js";
import { dom, memoryStorage } from "../helpers.js";

function themedRuntime(matches = false) {
  const runtime = dom();
  const listeners = new Set();
  const media = {
    matches,
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
    change(next) { media.matches = next; listeners.forEach((listener) => listener({ matches: next })); }
  };
  runtime.window.matchMedia = () => media;
  return { runtime, media };
}

test("theme defaults to system, persists explicit choices, and sets data attributes", () => {
  const { runtime } = themedRuntime(true);
  const storage = memoryStorage();
  const theme = createThemeService({ document: runtime.window.document, window: runtime.window, storage });
  assert.equal(theme.getPreference(), "system");
  assert.equal(theme.getResolvedTheme(), "dark");
  assert.equal(runtime.window.document.documentElement.dataset.theme, "dark");
  theme.setPreference("light");
  assert.equal(storage.getItem(theme.storageKey), "light");
  assert.equal(runtime.window.document.documentElement.dataset.themePreference, "light");
});

test("system mode responds to preference changes and emits an event", () => {
  const { runtime, media } = themedRuntime(false);
  const theme = createThemeService({ document: runtime.window.document, window: runtime.window, storage: memoryStorage() });
  const events = [];
  runtime.window.document.addEventListener(THEME_EVENT, (event) => events.push(event.detail.resolvedTheme));
  const subscriptions = [];
  theme.subscribe((value) => subscriptions.push(value.resolvedTheme));
  media.change(true);
  assert.equal(theme.getResolvedTheme(), "dark");
  assert.equal(events.at(-1), "dark");
  assert.equal(subscriptions.at(-1), "dark");
});

test("explicit light or dark mode ignores later system changes", () => {
  const { runtime, media } = themedRuntime(false);
  const theme = createThemeService({ document: runtime.window.document, window: runtime.window, storage: memoryStorage() });
  theme.setPreference("light");
  media.change(true);
  assert.equal(theme.getResolvedTheme(), "light");
  assert.equal(runtime.window.document.documentElement.dataset.theme, "light");
});
