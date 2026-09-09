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

test("onboarding uses the hub-eligible registration key instead of the platform-wide picker", async () => {
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
  assert.deepEqual(options.map((option) => option.registrationKey), ["tlevel-dsd-y2"]);
  assert.deepEqual(calls, []);
});

test("T Level onboarding view hides the year and group picker when one hub group is eligible", async () => {
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
  await new Promise((resolve) => setTimeout(resolve, 0));
  const picker = view.element.querySelector("#lp-registration-option");
  assert.equal(picker.value, "tlevel-dsd-y2");
  assert.equal(picker.closest(".lp-form__field").hidden, true);
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

test("Cyber-enrolled learner with one T Level open_auto group becomes T Level ready", async () => {
  const client = fakeSupabase({
    session: { access_token: "managed", user: { id: "auth-user" } },
    views: {
      my_profile: [{ student_number: "HUB-CYBER", first_name: "Cyber", surname: "Learner" }],
      my_enrolments: [{ status: "active", group_code: "CYBER-TEST-A", year_group: "Year 1" }],
      my_assignments: [
        { activity_key: "week2-malware-symptoms" },
        { activity_key: "foundations-requirements-classification" }
      ]
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
