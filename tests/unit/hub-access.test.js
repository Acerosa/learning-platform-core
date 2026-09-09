import test from "node:test";
import assert from "node:assert/strict";
import { createHubAccessService, isHubEnrolledStatus } from "../../src/core/hub-access/hub-access-service.js";
import { createOnboardingService } from "../../src/core/onboarding/onboarding-service.js";
import { createOnboardingView } from "../../src/ui/onboarding/onboarding-view.js";
import { createPlatform } from "../../src/platform.js";
import { derivePlatformState } from "../../src/core/state/platform-state.js";
import { fakeSupabase, memoryStorage, dom } from "../helpers.js";

function enrolledRpcs(assignments = [{ activity_key: "activity-1" }]) {
  return {
    resolve_learner_hub_access: [{
      status: "enrolled",
      idempotent: true,
      academic_year: "2026-27",
      year_group: "Year 2",
      course_title: "T Level Digital Software Development",
      group_code: "TLEVEL-DSD-Y2",
      group_name: "T Level Year 2",
      enrolment_status: "active",
      registration_option: null
    }],
    my_hub_assignments: assignments
  };
}

test("hub access maps enrolled statuses and learner-safe fields", async () => {
  const access = createHubAccessService({
    api: {
      resolveLearnerHubAccess: async (payload) => {
        assert.deepEqual(payload, {
          p_hub_code: "tlevel-software-development",
          p_course_key: "t-level-digital-software-development"
        });
        return [{
          status: "enrolled",
          group_code: "TLEVEL-DSD-Y2",
          year_group: "Year 2",
          registration_option: null
        }];
      }
    },
    hubCode: "tlevel-software-development",
    courseKey: "t-level-digital-software-development"
  });
  const row = await access.resolve();
  assert.equal(row.status, "enrolled");
  assert.equal(row.groupCode, "TLEVEL-DSD-Y2");
  assert.equal(isHubEnrolledStatus(row.status), true);
  assert.equal(isHubEnrolledStatus("no_enrolment"), false);
});

test("onboarding does not expose a platform-wide year and group picker", async () => {
  const calls = [];
  const service = createOnboardingService({
    api: {
      getRegistrationOptions: async () => {
        calls.push("global");
        return [
          { registration_option: "cyber-year-1-test", year_group: "Year 1", group_code: "CYBER-TEST-A" },
          { registration_option: "tlevel-dsd-y2", year_group: "Year 2", group_code: "TLEVEL-DSD-Y2" }
        ];
      }
    },
    authService: { isSignedIn: () => true },
    storage: memoryStorage(),
    hubAccessService: {
      resolve: async () => ({
        status: "profile_required",
        registrationOption: "tlevel-dsd-y2",
        yearGroup: "Year 2",
        groupCode: "TLEVEL-DSD-Y2",
        groupName: "T Level Year 2",
        courseTitle: "T Level Digital Software Development",
        academicYear: "2026-27"
      })
    }
  });
  const options = await service.getRegistrationOptions();
  assert.deepEqual(options, []);
  assert.deepEqual(calls, []);
});

test("T Level onboarding view has no year and group picker", async () => {
  const runtime = dom();
  const service = createOnboardingService({
    api: {},
    authService: { isSignedIn: () => true },
    storage: memoryStorage(),
    hubAccessService: {
      resolve: async () => ({
        status: "profile_required",
        registrationOption: "tlevel-dsd-y2",
        yearGroup: "Year 2",
        groupCode: "TLEVEL-DSD-Y2",
        groupName: "T Level Year 2",
        courseTitle: "T Level Digital Software Development",
        academicYear: "2026-27"
      })
    }
  });
  const view = createOnboardingView({
    document: runtime.window.document,
    onboardingService: service
  });
  const picker = view.element.querySelector("#lp-registration-option");
  assert.equal(picker, null);
  assert.match(view.element.textContent, /Enter your learner details to finish setting up your account/);
  assert.equal(view.element.textContent.includes("Choose a year and group"), false);
  view.destroy();
});

test("derivePlatformState treats other-hub enrolments as not ready for this hub", () => {
  assert.equal(derivePlatformState({
    session: {},
    profile: {},
    enrolments: [{ groupCode: "CYBER-TEST-A" }],
    assignments: [{ activity_key: "week2-malware-symptoms" }],
    hubAccess: { status: "no_enrolment" }
  }), "no-enrolment");
  assert.equal(derivePlatformState({
    session: {},
    profile: {},
    enrolments: [{ groupCode: "TLEVEL-DSD-Y2" }],
    assignments: [{ activity_key: "activity-1" }],
    hubAccess: { status: "enrolled" }
  }), "ready");
});

test("platform readiness uses hub assignments, not the unscoped my_assignments union", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "000123", first_name: "Ada", surname: "Lovelace" }],
      my_enrolments: [
        { status: "active", group_code: "CYBER-TEST-A", year_group: "Year 1" },
        { status: "active", group_code: "TLEVEL-DSD-Y2", year_group: "Year 2" }
      ],
      my_assignments: [
        { activity_key: "week2-malware-symptoms" },
        { activity_key: "foundations-requirements-classification" }
      ]
    },
    rpcs: {
      resolve_learner_hub_access: [{
        status: "enrolled",
        group_code: "TLEVEL-DSD-Y2",
        year_group: "Year 2",
        enrolment_status: "active"
      }],
      my_hub_assignments: [{ activity_key: "foundations-requirements-classification" }]
    }
  });
  const platform = createPlatform({
    hubCode: "tlevel-software-development",
    hubName: "T Level Digital Software Development Hub",
    courseKey: "t-level-digital-software-development"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(platform.state.getState().status, "ready");
  assert.deepEqual(await platform.assignments.getHubAssignments("tlevel-software-development"), [
    { activity_key: "foundations-requirements-classification" }
  ]);
  assert.deepEqual(await platform.assignments.getAssignments(), [
    { activity_key: "week2-malware-symptoms" },
    { activity_key: "foundations-requirements-classification" }
  ]);
  const rpcs = client.calls.filter((call) => call.type === "rpc").map((call) => call.name);
  assert.equal(rpcs.includes("resolve_learner_hub_access"), true);
  assert.equal(rpcs.includes("my_hub_assignments"), true);
  platform.destroy();
});

function hubWriteClient({
  enrolments,
  writtenGroup,
  writeStatus = "enrolled_created",
  hubAssignments = [{ activity_key: "foundations-requirements-classification" }]
}) {
  const enrolmentRows = enrolments.map((row) => ({ ...row }));
  const stats = { writes: 0 };
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "HUB-WRITE", first_name: "Hub", surname: "Learner" }],
      my_enrolments: enrolmentRows,
      my_assignments: [
        { activity_key: "week2-malware-symptoms" },
        { activity_key: "foundations-requirements-classification" }
      ]
    },
    rpcs: {
      resolve_learner_hub_access: () => {
        const alreadyActive = enrolmentRows.some((row) => (
          row.status === "active" && row.group_code === writtenGroup.group_code
        ));
        if (!alreadyActive) {
          stats.writes += 1;
          const inactiveMatch = enrolmentRows.find((row) => row.group_code === writtenGroup.group_code);
          if (inactiveMatch) {
            inactiveMatch.status = "active";
          } else {
            enrolmentRows.push({
              status: "active",
              group_code: writtenGroup.group_code,
              group_name: writtenGroup.group_name || writtenGroup.group_code,
              year_group: writtenGroup.year_group
            });
          }
          return [{
            status: writeStatus,
            group_code: writtenGroup.group_code,
            group_name: writtenGroup.group_name || writtenGroup.group_code,
            year_group: writtenGroup.year_group
          }];
        }
        return [{
          status: "enrolled",
          group_code: writtenGroup.group_code,
          group_name: writtenGroup.group_name || writtenGroup.group_code,
          year_group: writtenGroup.year_group
        }];
      },
      my_hub_assignments: hubAssignments
    }
  });
  client.hubEnrolmentWrites = () => stats.writes;
  return client;
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("Cyber-enrolled learner with one T Level open_auto group becomes T Level ready", async () => {
  const client = hubWriteClient({
    enrolments: [{ status: "active", group_code: "CYBER-TEST-A", year_group: "Year 1" }],
    writtenGroup: { group_code: "TLEVEL-DSD-Y2", group_name: "T Level Year 2", year_group: "Year 2" }
  });
  const platform = createPlatform({
    hubCode: "tlevel-software-development",
    hubName: "T Level Digital Software Development Hub",
    courseKey: "t-level-digital-software-development"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  await settle();
  assert.equal(platform.state.getState().status, "ready");
  assert.equal(platform.learner.getContext().groupCode, "TLEVEL-DSD-Y2");
  assert.equal(platform.learner.getContext().yearGroup, "Year 2");
  assert.deepEqual(await platform.assignments.getHubAssignments("tlevel-software-development"), [
    { activity_key: "foundations-requirements-classification" }
  ]);
  assert.equal(client.hubEnrolmentWrites(), 1);
  platform.destroy();
});

test("after enrolled_created, learner context follows the new hub enrolment without a second write", async () => {
  const client = hubWriteClient({
    enrolments: [{ status: "active", group_code: "CYBER-TEST-A", year_group: "Year 1" }],
    writtenGroup: { group_code: "TLEVEL-DSD-Y2", group_name: "T Level Year 2", year_group: "Year 2" }
  });
  const platform = createPlatform({
    hubCode: "tlevel-software-development",
    hubName: "T Level Digital Software Development Hub",
    courseKey: "t-level-digital-software-development"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  await settle();
  assert.equal(platform.state.getState().status, "ready");
  assert.equal(platform.learner.getContext().groupCode, "TLEVEL-DSD-Y2");
  assert.equal(client.hubEnrolmentWrites(), 1);
  await platform.learner.refresh({ preferredGroupCode: "TLEVEL-DSD-Y2" });
  await settle();
  assert.equal(platform.state.getState().status, "ready");
  assert.equal(platform.learner.getContext().groupCode, "TLEVEL-DSD-Y2");
  assert.equal(client.hubEnrolmentWrites(), 1);
  const laterResolves = client.calls.filter((call) => call.type === "rpc" && call.name === "resolve_learner_hub_access");
  assert.equal(laterResolves.length >= 2, true);
  platform.destroy();
});

test("after enrolled_reactivated, learner context follows the restored hub enrolment", async () => {
  const client = hubWriteClient({
    enrolments: [
      { status: "active", group_code: "CYBER-TEST-A", year_group: "Year 1" },
      { status: "withdrawn", group_code: "TLEVEL-DSD-Y2", year_group: "Year 2" }
    ],
    writtenGroup: { group_code: "TLEVEL-DSD-Y2", group_name: "T Level Year 2", year_group: "Year 2" },
    writeStatus: "enrolled_reactivated"
  });
  const platform = createPlatform({
    hubCode: "tlevel-software-development",
    hubName: "T Level Digital Software Development Hub",
    courseKey: "t-level-digital-software-development"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  await settle();
  assert.equal(platform.state.getState().status, "ready");
  assert.equal(platform.learner.getContext().groupCode, "TLEVEL-DSD-Y2");
  assert.equal(platform.learner.getContext().yearGroup, "Year 2");
  assert.equal(client.hubEnrolmentWrites(), 1);
  platform.destroy();
});

test("L2E-enrolled learner with one T Level open_auto group becomes T Level ready", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "HUB-L2E", first_name: "L2E", surname: "Learner" }],
      my_enrolments: [{ status: "active", group_code: "L2E-DELIVERY-A", year_group: "Year 1" }],
      my_assignments: [{ activity_key: "l2e-activity" }]
    },
    rpcs: {
      resolve_learner_hub_access: [{
        status: "enrolled_created",
        group_code: "TLEVEL-DSD-Y2",
        year_group: "Year 2"
      }],
      my_hub_assignments: [{ activity_key: "foundations-requirements-classification" }]
    }
  });
  const platform = createPlatform({
    hubCode: "tlevel-software-development",
    hubName: "T Level Digital Software Development Hub",
    courseKey: "t-level-digital-software-development"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(platform.state.getState().status, "ready");
  assert.deepEqual(await platform.assignments.getHubAssignments("tlevel-software-development"), [
    { activity_key: "foundations-requirements-classification" }
  ]);
  platform.destroy();
});

test("Unit 14-enrolled learner with one T Level open_auto group becomes T Level ready", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "HUB-U14", first_name: "Unit", surname: "Fourteen" }],
      my_enrolments: [{ status: "active", group_code: "UNIT14-TEST-A", year_group: "Year 1" }],
      my_assignments: [{ activity_key: "unit14-activity" }]
    },
    rpcs: {
      resolve_learner_hub_access: [{
        status: "enrolled_created",
        group_code: "TLEVEL-DSD-Y2",
        year_group: "Year 2"
      }],
      my_hub_assignments: [{ activity_key: "foundations-requirements-classification" }]
    }
  });
  const platform = createPlatform({
    hubCode: "tlevel-software-development",
    hubName: "T Level Digital Software Development Hub",
    courseKey: "t-level-digital-software-development"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(platform.state.getState().status, "ready");
  assert.deepEqual(await platform.assignments.getHubAssignments("tlevel-software-development"), [
    { activity_key: "foundations-requirements-classification" }
  ]);
  platform.destroy();
});

test("an unrelated enrolment is not treated as T Level authority", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "HUB-CYBER", first_name: "Cyber", surname: "Learner" }],
      my_enrolments: [{ status: "active", group_code: "CYBER-TEST-A", year_group: "Year 1" }],
      my_assignments: [{ activity_key: "week2-malware-symptoms" }]
    },
    rpcs: {
      resolve_learner_hub_access: [{ status: "no_enrolment", group_code: "TLEVEL-DSD-Y2" }],
      my_hub_assignments: [{ activity_key: "week2-malware-symptoms" }]
    }
  });
  const platform = createPlatform({
    hubCode: "tlevel-software-development",
    hubName: "T Level Digital Software Development Hub",
    courseKey: "t-level-digital-software-development"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(platform.state.getState().status, "no-enrolment");
  assert.equal(client.calls.some((call) => call.type === "rpc" && call.name === "my_hub_assignments"), false);
  platform.destroy();
});

test("Cyber hub readiness uses Cyber hub assignments when the learner is also on T Level", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "000123", first_name: "Ada", surname: "Lovelace" }],
      my_enrolments: [
        { status: "active", group_code: "CYBER-TEST-A", year_group: "Year 1" },
        { status: "active", group_code: "TLEVEL-DSD-Y2", year_group: "Year 2" }
      ],
      my_assignments: [
        { activity_key: "week2-malware-symptoms" },
        { activity_key: "foundations-requirements-classification" }
      ]
    },
    rpcs: {
      resolve_learner_hub_access: [{
        status: "enrolled",
        group_code: "CYBER-TEST-A",
        year_group: "Year 1",
        enrolment_status: "active"
      }],
      my_hub_assignments: [{ activity_key: "week2-malware-symptoms" }]
    }
  });
  const platform = createPlatform({
    hubCode: "unit-3-cyber-security",
    hubName: "Unit 3 Cyber Security Hub",
    courseKey: "ocr-level-3-it"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(platform.state.getState().status, "ready");
  assert.deepEqual(await platform.assignments.getHubAssignments("unit-3-cyber-security"), [
    { activity_key: "week2-malware-symptoms" }
  ]);
  const accessPayload = client.calls.find((call) => call.type === "rpc" && call.name === "resolve_learner_hub_access")?.payload;
  assert.deepEqual(accessPayload, {
    p_hub_code: "unit-3-cyber-security",
    p_course_key: "ocr-level-3-it"
  });
  platform.destroy();
});

test("platform still uses the compatibility assignment view through getAssignments", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "000123", first_name: "Ada", surname: "Lovelace" }],
      my_enrolments: [{ status: "active", group_code: "A", year_group: "Year 1" }],
      my_assignments: [{ activity_key: "activity-1" }]
    },
    rpcs: enrolledRpcs()
  });
  const platform = createPlatform({
    hubCode: "test-hub",
    hubName: "Test Hub",
    courseKey: "test-course"
  }, {
    supabaseClient: client,
    sessionStorage: memoryStorage(),
    document: null,
    window: null
  });
  await platform.initialise();
  assert.deepEqual(await platform.assignments.getAssignments(), [{ activity_key: "activity-1" }]);
  platform.destroy();
});

test("joinClass sends hub code and class key, not a group UUID", async () => {
  let joined = null;
  const service = createOnboardingService({
    api: {},
    authService: { isSignedIn: () => true },
    learnerContext: { refresh: async () => {} },
    storage: memoryStorage(),
    hubAccessService: {
      join: async (classKey) => {
        joined = classKey;
        return {
          status: "enrolled_created",
          groupCode: "CYBER-TEST-A",
          yearGroup: "Year 1"
        };
      }
    }
  });
  const access = await service.joinClass("cyber-year-1-test");
  assert.equal(joined, "cyber-year-1-test");
  assert.equal(access.groupCode, "CYBER-TEST-A");
});

test("complete then resolve auto-enrols a T Level learner without a group picker value", async () => {
  const calls = [];
  const service = createOnboardingService({
    api: {
      completeOnboarding: async (payload) => {
        calls.push({ type: "complete", payload });
        return [{ student_number: "BOUND-TLEVEL" }];
      }
    },
    authService: { isSignedIn: () => true },
    learnerContext: { refresh: async () => { calls.push({ type: "refresh" }); } },
    storage: memoryStorage(),
    hubAccessService: {
      resolve: async () => {
        calls.push({ type: "resolve" });
        return {
          status: "enrolled_created",
          groupCode: "TLEVEL-DSD-Y2",
          yearGroup: "Year 2"
        };
      }
    }
  });
  await service.complete({ firstName: "New", surname: "TLevel", studentNumber: "BOUND-TLEVEL" }, "cyber-year-1-test");
  assert.equal(calls[0].payload.p_registration_option, "");
  assert.equal(calls.some((call) => call.type === "resolve"), true);
});

test("hub access join RPC uses only hub code and class key", async () => {
  const access = createHubAccessService({
    api: {
      joinLearnerHubGroup: async (payload) => {
        assert.deepEqual(payload, {
          p_hub_code: "unit-3-cyber-security",
          p_class_key: "cyber-year-1-test"
        });
        return [{ status: "enrolled_created", group_code: "CYBER-TEST-A" }];
      }
    },
    hubCode: "unit-3-cyber-security",
    courseKey: "ocr-level-3-it"
  });
  const row = await access.join("cyber-year-1-test");
  assert.equal(row.status, "enrolled_created");
  assert.equal(row.groupCode, "CYBER-TEST-A");
});
