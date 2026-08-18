import { PlatformError } from "../errors/platform-error.js";

export const NAVIGATION_MODES = Object.freeze(["standard", "as-supplied"]);

export const STANDARD_NAVIGATION = Object.freeze([
  Object.freeze({ id: "home", label: "Home" }),
  Object.freeze({ id: "learning", label: "Learning" }),
  Object.freeze({ id: "activities", label: "Activities" }),
  Object.freeze({ id: "resources", label: "Resources" }),
  Object.freeze({ id: "progress", label: "Progress" }),
  Object.freeze({ id: "account", label: "Account" })
]);

const HUB_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function navigationItem(item, defaults = {}) {
  const id = cleanString(item?.id) || defaults.id;
  const label = cleanString(item?.label) || defaults.label;
  const path = cleanString(item?.path);
  if (!id || !label) {
    throw new PlatformError({ code: "INVALID_NAVIGATION_ITEM", category: "configuration" });
  }
  return Object.freeze({
    id,
    label,
    path,
    enabled: item.enabled !== false && Boolean(path)
  });
}

function navigationFrom(items = [], mode = "standard") {
  if (!Array.isArray(items)) {
    throw new PlatformError({ code: "INVALID_NAVIGATION", category: "configuration" });
  }
  if (mode === "as-supplied") {
    if (!items.length) {
      throw new PlatformError({ code: "INVALID_NAVIGATION", category: "configuration" });
    }
    return Object.freeze(items.map((item) => {
      const parsed = navigationItem(item);
      if (!parsed.path) {
        throw new PlatformError({ code: "INVALID_NAVIGATION_ITEM", category: "configuration" });
      }
      return parsed;
    }));
  }
  const supplied = new Map(items.map((item) => [cleanString(item?.id), item]));
  const standard = STANDARD_NAVIGATION.map((definition) => {
    const item = supplied.get(definition.id) || {};
    supplied.delete(definition.id);
    return navigationItem({ ...definition, ...item, id: definition.id, label: cleanString(item.label) || definition.label }, definition);
  });
  const additions = Array.from(supplied.values()).map((item) => {
    const parsed = navigationItem(item);
    if (!parsed.path) {
      throw new PlatformError({ code: "INVALID_NAVIGATION_ITEM", category: "configuration" });
    }
    return parsed;
  });
  return Object.freeze([...standard, ...additions]);
}

function navigationModeFrom(value) {
  const mode = cleanString(value) || "standard";
  if (!NAVIGATION_MODES.includes(mode)) {
    throw new PlatformError({ code: "INVALID_NAVIGATION_MODE", category: "configuration" });
  }
  return mode;
}

function safeBrandColour(value, fallback) {
  const colour = cleanString(value);
  if (!colour) return fallback;
  if (!HEX_COLOUR_PATTERN.test(colour)) {
    throw new PlatformError({ code: "INVALID_THEME_COLOUR", category: "configuration" });
  }
  return colour;
}

export function createPlatformConfig(options = {}) {
  const hubCode = cleanString(options.hubCode);
  const hubName = cleanString(options.hubName);
  if (!HUB_CODE_PATTERN.test(hubCode)) {
    throw new PlatformError({ code: "INVALID_HUB_CODE", category: "configuration" });
  }
  if (!hubName) {
    throw new PlatformError({ code: "INVALID_HUB_NAME", category: "configuration" });
  }
  if (options.apiSchema && options.apiSchema !== "api") {
    throw new PlatformError({ code: "PRIVATE_SCHEMA_PROHIBITED", category: "configuration" });
  }

  const navigationMode = navigationModeFrom(options.navigationMode);

  return Object.freeze({
    hubCode,
    hubName,
    platformVersion: cleanString(options.platformVersion) || "0.1",
    apiSchema: "api",
    accountPath: cleanString(options.accountPath) || "./account/",
    navigationMode,
    navigation: navigationFrom(options.navigation, navigationMode),
    features: Object.freeze({ ...(options.features || {}) }),
    theme: Object.freeze({
      primary: safeBrandColour(options.theme?.primary, "#315b7d"),
      accent: safeBrandColour(options.theme?.accent, "#4f7695")
    }),
    courseKey: cleanString(options.courseKey),
    supabase: Object.freeze({
      projectUrl: cleanString(options.supabase?.projectUrl),
      publishableKey: cleanString(options.supabase?.publishableKey)
    })
  });
}
