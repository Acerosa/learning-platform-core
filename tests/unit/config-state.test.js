import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformConfig, STANDARD_NAVIGATION } from "../../src/core/config/platform-config.js";
import { createFeatureFlags } from "../../src/core/feature-flags/feature-flags.js";
import { createPlatformState, derivePlatformState, PLATFORM_STATES } from "../../src/core/state/platform-state.js";

test("platform config supplies all standard navigation definitions and hub branding", () => {
  const config = createPlatformConfig({
    hubCode: "sample-hub",
    hubName: "Sample Hub",
    navigation: [{ id: "home", path: "./" }, { id: "account", path: "./account/" }, { id: "labs", label: "Labs", path: "./labs/" }],
    theme: { primary: "#123456", accent: "#abcdef" }
  });
  assert.deepEqual(config.navigation.slice(0, 6).map((item) => item.id), STANDARD_NAVIGATION.map((item) => item.id));
  assert.equal(config.navigation.find((item) => item.id === "progress").enabled, false);
  assert.equal(config.navigation.find((item) => item.id === "labs").enabled, true);
  assert.equal(config.theme.primary, "#123456");
  assert.equal(config.apiSchema, "api");
  assert.equal(config.navigationMode, "standard");
});

test("as-supplied navigation keeps hub order without injecting unused standard routes", () => {
  const config = createPlatformConfig({
    hubCode: "sample-hub",
    hubName: "Sample Hub",
    navigationMode: "as-supplied",
    navigation: [
      { id: "home", label: "Home", path: "./" },
      { id: "learning", label: "Weeks", path: "./weeks/" },
      { id: "assignments", label: "Assignments", path: "./assignments/" }
    ]
  });
  assert.deepEqual(config.navigation.map((item) => item.id), ["home", "learning", "assignments"]);
  assert.equal(config.navigationMode, "as-supplied");
  assert.throws(
    () => createPlatformConfig({ hubCode: "hub", hubName: "Hub", navigationMode: "custom" }),
    (error) => error.code === "INVALID_NAVIGATION_MODE"
  );
});

test("platform config rejects private schemas and invalid branding", () => {
  assert.throws(
    () => createPlatformConfig({ hubCode: "hub", hubName: "Hub", apiSchema: "learning" }),
    (error) => error.code === "PRIVATE_SCHEMA_PROHIBITED"
  );
  assert.throws(
    () => createPlatformConfig({ hubCode: "hub", hubName: "Hub", theme: { primary: "red" } }),
    (error) => error.code === "INVALID_THEME_COLOUR"
  );
});

test("canonical platform state covers the LHDS vocabulary", () => {
  assert.equal(PLATFORM_STATES.includes("onboarding-required"), true);
  assert.equal(PLATFORM_STATES.includes("offline"), true);
  assert.equal(derivePlatformState(), "signed-out");
  assert.equal(derivePlatformState({ session: {}, profile: null }), "onboarding-required");
  assert.equal(derivePlatformState({ session: {}, profile: {}, enrolments: [] }), "no-enrolment");
  assert.equal(derivePlatformState({ session: {}, profile: {}, enrolments: [{}], assignments: [] }), "no-assignments");
  assert.equal(derivePlatformState({ session: {}, profile: {}, enrolments: [{}], assignments: [{}] }), "ready");
});

test("platform state and feature flags publish immutable snapshots", () => {
  const state = createPlatformState();
  const states = [];
  state.subscribe((value) => states.push(value.status));
  state.transition("ready");
  assert.deepEqual(states, ["loading", "ready"]);

  const flags = createFeatureFlags({ beta: false });
  const snapshots = [];
  flags.subscribe((value) => snapshots.push(value));
  flags.set({ beta: true });
  assert.equal(flags.isEnabled("beta"), true);
  assert.equal(Object.isFrozen(snapshots.at(-1)), true);
});
