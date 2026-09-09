import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createAuthStorageKey } from "../../src/core/auth/auth-storage-key.js";
import { createSupabaseClient } from "../../src/core/api/supabase-client.js";
import { createAuthService } from "../../src/core/auth/auth-service.js";
import { createPlatform } from "../../src/platform.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";

const PROJECT_URL = "https://hubwpkrqndorznwzvaer.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_contract-public-key";
const TLEVEL_HUB = "tlevel-software-development";
const CYBER_HUB = "unit-3-cyber-security";
const TLEVEL_KEY = createAuthStorageKey(PROJECT_URL, TLEVEL_HUB);
const CYBER_KEY = createAuthStorageKey(PROJECT_URL, CYBER_HUB);
const LEGACY_KEY = "sb-hubwpkrqndorznwzvaer-auth-token";

class FakeWebSocket {
  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {}
}

function tracingStorage() {
  const values = new Map();
  const log = [];
  return {
    getItem(key) {
      log.push(["get", key]);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      log.push(["set", key]);
      values.set(key, String(value));
    },
    removeItem(key) {
      log.push(["remove", key]);
      values.delete(key);
    },
    keys: () => Array.from(values.keys()),
    log
  };
}

function sdkCreateClient(url, key, options = {}) {
  return createClient(url, key, {
    ...options,
    realtime: { transport: FakeWebSocket }
  });
}

function hubClient(hubCode, storage, createClientFn = sdkCreateClient) {
  return createSupabaseClient({
    projectUrl: PROJECT_URL,
    publishableKey: PUBLISHABLE_KEY,
    hubCode
  }, {
    createClient: createClientFn,
    authStorage: storage
  });
}

function fakeHub(hubCode, client) {
  return createPlatform({
    hubCode,
    hubName: `${hubCode} hub`,
    courseKey: `${hubCode}-course`,
    supabase: {
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY
    }
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
}

test("the pinned SDK default storage key is the same-origin collision key", () => {
  const client = sdkCreateClient(PROJECT_URL, PUBLISHABLE_KEY);
  assert.equal(client.storageKey, LEGACY_KEY);
  assert.notEqual(TLEVEL_KEY, LEGACY_KEY);
  assert.notEqual(CYBER_KEY, LEGACY_KEY);
  assert.notEqual(TLEVEL_KEY, CYBER_KEY);
});

test("createSupabaseClient requires a hub code and does not use the default storage key", () => {
  assert.throws(
    () => createSupabaseClient({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY
    }, { createClient: sdkCreateClient }),
    (error) => error.code === "INVALID_HUB_CODE"
  );
});

test("CASE 1/2: each hub persists under its own namespace and restores after reload", () => {
  const storage = tracingStorage();
  const tlevel = hubClient(TLEVEL_HUB, storage);
  const cyber = hubClient(CYBER_HUB, storage);

  assert.equal(tlevel.storageKey, TLEVEL_KEY);
  assert.equal(cyber.storageKey, CYBER_KEY);
  assert.equal(tlevel.auth.storageKey, TLEVEL_KEY);
  assert.equal(cyber.auth.storageKey, CYBER_KEY);

  storage.setItem(TLEVEL_KEY, JSON.stringify({ access_token: "tlevel-a", refresh_token: "tlevel-refresh-a" }));
  storage.setItem(CYBER_KEY, JSON.stringify({ access_token: "cyber-b", refresh_token: "cyber-refresh-b" }));

  const reloadedTlevel = hubClient(TLEVEL_HUB, storage);
  const reloadedCyber = hubClient(CYBER_HUB, storage);
  assert.equal(reloadedTlevel.storageKey, TLEVEL_KEY);
  assert.equal(reloadedCyber.storageKey, CYBER_KEY);
  assert.equal(JSON.parse(storage.getItem(TLEVEL_KEY)).access_token, "tlevel-a");
  assert.equal(JSON.parse(storage.getItem(CYBER_KEY)).access_token, "cyber-b");
});

test("CASE 3/10: different hub clients never read or write each other's storage keys", () => {
  const storage = tracingStorage();
  const tlevelOnly = hubClient(TLEVEL_HUB, storage);
  const tlevelLog = storage.log.slice();
  assert.equal(tlevelOnly.storageKey, TLEVEL_KEY);
  assert.equal(tlevelLog.length > 0, true);
  assert.equal(tlevelLog.some((entry) => String(entry[1]) === CYBER_KEY), false);
  assert.equal(tlevelLog.some((entry) => String(entry[1]) === LEGACY_KEY), false);

  const cyberOnly = hubClient(CYBER_HUB, storage);
  const cyberLog = storage.log.slice(tlevelLog.length);
  assert.equal(cyberOnly.storageKey, CYBER_KEY);
  assert.equal(cyberLog.some((entry) => String(entry[1]) === TLEVEL_KEY), false);
  assert.equal(cyberLog.some((entry) => String(entry[1]) === LEGACY_KEY), false);
  assert.equal(storage.keys().includes(LEGACY_KEY), false);
});

test("pinned auth-js scopes BroadcastChannel and session removal to storageKey", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../node_modules/@supabase/auth-js/dist/module/GoTrueClient.js", import.meta.url), "utf8");
  assert.match(source, /this\.broadcastChannel = new globalThis\.BroadcastChannel\(this\.storageKey\)/);
  assert.match(source, /await removeItemAsync\(this\.storage, this\.storageKey\)/);
  assert.doesNotMatch(source, /localStorage\.clear\(/);
  assert.match(source, /async signOut\(options = \{ scope: 'global' \}\)/);
});

test("CASE 3/5/6: signing out one hub does not sign out another hub client", async () => {
  const tlevelClient = fakeSupabase({
    session: { access_token: "tlevel-a", user: { id: "learner-a" } }
  });
  const cyberClient = fakeSupabase({
    session: { access_token: "cyber-b", user: { id: "learner-b" } }
  });
  const tlevel = fakeHub(TLEVEL_HUB, tlevelClient);
  const cyber = fakeHub(CYBER_HUB, cyberClient);

  await tlevel.auth.initialise();
  await cyber.auth.initialise();
  assert.equal(tlevel.auth.isSignedIn(), true);
  assert.equal(cyber.auth.isSignedIn(), true);
  assert.equal(tlevel.auth.getSession().user.id, "learner-a");
  assert.equal(cyber.auth.getSession().user.id, "learner-b");

  await tlevel.auth.signOut();
  assert.equal(tlevel.auth.isSignedIn(), false);
  assert.equal(cyber.auth.isSignedIn(), true);
  assert.equal(cyber.auth.getSession().user.id, "learner-b");
  assert.deepEqual(
    tlevelClient.calls.find((call) => call.type === "sign-out")?.options,
    { scope: "local" }
  );
  assert.equal(cyberClient.calls.some((call) => call.type === "sign-out"), false);

  await cyber.auth.signOut();
  assert.equal(cyber.auth.isSignedIn(), false);
  assert.equal(tlevel.auth.isSignedIn(), false);
  tlevel.destroy();
  cyber.destroy();
});

test("CASE 4: the same Auth user can remain independently persisted per hub", async () => {
  const session = { access_token: "shared-identity", user: { id: "learner-a" } };
  const tlevel = fakeHub(TLEVEL_HUB, fakeSupabase({ session }));
  const cyber = fakeHub(CYBER_HUB, fakeSupabase({ session }));
  await tlevel.auth.initialise();
  await cyber.auth.initialise();
  assert.equal(tlevel.auth.getSession().user.id, "learner-a");
  assert.equal(cyber.auth.getSession().user.id, "learner-a");
  await tlevel.auth.signOut();
  assert.equal(tlevel.auth.isSignedIn(), false);
  assert.equal(cyber.auth.isSignedIn(), true);
  tlevel.destroy();
  cyber.destroy();
});

test("CASE 8: session isolation does not grant hub access; resolver still runs with hub identifiers only", async () => {
  const rpcs = [];
  const client = fakeSupabase({
    session: { access_token: "tlevel-only", user: { id: "learner-a" } },
    views: {
      my_profile: [{ student_number: "000123", first_name: "Ada", surname: "Lovelace" }],
      my_enrolments: [{ status: "active", group_code: "TLEVEL-DSD-Y2", year_group: "Year 2" }],
      my_assignments: [{ activity_key: "foundations-requirements-classification" }]
    },
    rpcs: {
      resolve_learner_hub_access(payload) {
        rpcs.push(payload);
        return [{
          status: "no_enrolment",
          idempotent: true,
          academic_year: null,
          year_group: null,
          course_title: null,
          group_code: null,
          group_name: null,
          enrolment_status: null,
          registration_option: null
        }];
      },
      my_hub_assignments() {
        return [];
      }
    }
  });
  const cyber = fakeHub(CYBER_HUB, client);
  await cyber.initialise();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cyber.state.getState().status, "no-enrolment");
  assert.deepEqual(rpcs, [{
    p_hub_code: CYBER_HUB,
    p_course_key: "unit-3-cyber-security-course"
  }]);
  cyber.destroy();
});

test("createPlatform derives the storage key from hubCode when it constructs the client", () => {
  let captured;
  createPlatform({
    hubCode: TLEVEL_HUB,
    hubName: "T Level Digital Software Development Hub",
    supabase: {
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY
    }
  }, {
    createClient(url, key, options) {
      captured = { url, key, options };
      return fakeSupabase();
    },
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  }).destroy();
  assert.equal(captured.options.auth.persistSession, true);
  assert.equal(captured.options.auth.autoRefreshToken, true);
  assert.equal(captured.options.auth.detectSessionInUrl, true);
  assert.equal(captured.options.auth.storageKey, TLEVEL_KEY);
});

test("injected supabaseClient remains the single client for that hub", () => {
  const client = fakeSupabase();
  const created = [];
  const platform = createPlatform({
    hubCode: TLEVEL_HUB,
    hubName: "T Level Digital Software Development Hub",
    supabase: {
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY
    }
  }, {
    supabaseClient: client,
    createClient() {
      created.push("created");
      return fakeSupabase();
    },
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  assert.equal(created.length, 0);
  platform.destroy();
});

test("auth.signOut always uses local scope", async () => {
  const client = fakeSupabase({
    session: { access_token: "token", user: { id: "learner-a" } }
  });
  const auth = createAuthService({ client });
  await auth.initialise();
  await auth.signOut();
  assert.deepEqual(
    client.calls.find((call) => call.type === "sign-out")?.options,
    { scope: "local" }
  );
});
