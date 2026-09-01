import test from "node:test";
import assert from "node:assert/strict";
import { createAuthService } from "../../src/core/auth/auth-service.js";
import { createLearnerContext } from "../../src/core/learner/learner-context.js";
import { createOnboardingService } from "../../src/core/onboarding/onboarding-service.js";
import { fakeSupabase, memoryStorage } from "../helpers.js";

test("auth restores a Supabase-managed session and publishes state", async () => {
  const client = fakeSupabase({ session: { access_token: "managed-by-supabase" } });
  const auth = createAuthService({ client });
  const states = [];
  auth.subscribe((state) => states.push(state.status));
  await auth.initialise();
  assert.equal(auth.isSignedIn(), true);
  assert.deepEqual(states, ["loading", "authenticated"]);
});

test("sign up reports the email-confirmation boundary without storing credentials", async () => {
  const client = fakeSupabase({ session: null });
  const auth = createAuthService({
    client,
    resolveRedirectUrl: () => "https://hub.example/"
  });
  const result = await auth.signUp("learner@example.test", "password-123");
  assert.equal(result.needsConfirmation, true);
  assert.deepEqual(client.calls.find((call) => call.type === "sign-up").credentials, {
    email: "learner@example.test",
    password: "password-123",
    options: { emailRedirectTo: "https://hub.example/" }
  });
});

test("learner context is backend-derived and includes stable header fields", async () => {
  const authListeners = [];
  const auth = {
    isSignedIn: () => true,
    initialise: async () => {},
    subscribe(listener) { authListeners.push(listener); listener({ status: "authenticated" }); return () => {}; }
  };
  const learner = createLearnerContext({
    authService: auth,
    profileService: { getProfile: async () => ({ student_number: "000123", first_name: "Ada", surname: "Lovelace", contact_email: "ada@example.test" }) },
    enrolmentService: { getEnrolments: async () => [{ status: "active", year_group: "Year 1", group_code: "Y1-A", academic_year: "2026-27" }] }
  });
  await learner.refresh();
  assert.deepEqual(learner.getContext(), {
    studentNumber: "000123",
    firstName: "Ada",
    surname: "Lovelace",
    fullName: "Ada Lovelace",
    displayName: "Ada Lovelace",
    contactEmail: "ada@example.test",
    yearGroup: "Year 1",
    academicYear: "2026-27",
    groupCode: "Y1-A",
    groupName: "",
    enrolments: learner.getContext().enrolments
  });
});

test("onboarding pending state preserves leading zeroes but excludes email and passwords", () => {
  const storage = memoryStorage();
  const service = createOnboardingService({
    api: {},
    authService: { isSignedIn: () => false },
    storage,
    pendingKey: "pending"
  });
  service.savePending({
    firstName: "Ada",
    surname: "Lovelace",
    studentNumber: "000123",
    registrationKey: "year-1-a",
    email: "ada@example.test",
    password: "never-store-this"
  });
  const raw = storage.getItem("pending");
  assert.equal(raw.includes("000123"), true);
  assert.equal(raw.includes("ada@example.test"), false);
  assert.equal(raw.includes("never-store-this"), false);
});

test("onboarding uses controlled registration options and the approved RPC arguments", async () => {
  let payload = null;
  let refreshed = false;
  const service = createOnboardingService({
    api: {
      getRegistrationOptions: async () => [{ registration_option: "year-1-a", year_group: "Year 1", group_code: "A" }],
      completeOnboarding: async (value) => { payload = value; return [{ student_number: "000123" }]; }
    },
    authService: { isSignedIn: () => true },
    learnerContext: { refresh: async () => { refreshed = true; } },
    storage: memoryStorage()
  });
  const options = await service.getRegistrationOptions();
  assert.equal(options[0].registrationKey, "year-1-a");
  await service.complete({ firstName: "Ada", surname: "Lovelace", studentNumber: "000123" }, "year-1-a");
  assert.deepEqual(payload, {
    p_first_name: "Ada",
    p_surname: "Lovelace",
    p_student_number: "000123",
    p_registration_option: "year-1-a"
  });
  assert.equal(refreshed, true);
});
