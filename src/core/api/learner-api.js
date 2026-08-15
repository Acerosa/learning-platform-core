import { mapPlatformError, PlatformError } from "../errors/platform-error.js";

function unwrap(result, operation) {
  if (result?.error) throw mapPlatformError(result.error, { operation });
  return result?.data ?? null;
}

function requireApiSchema(schema) {
  if (schema !== "api") {
    throw new PlatformError({ code: "PRIVATE_SCHEMA_PROHIBITED", category: "configuration" });
  }
}

export function createLearnerApi({ client, schema = "api", logger } = {}) {
  requireApiSchema(schema);
  if (!client || typeof client.schema !== "function") {
    throw new PlatformError({ code: "SUPABASE_CLIENT_REQUIRED", category: "configuration" });
  }

  const api = client.schema(schema);

  async function read(view, { select = "*", order, ascending = true, filters = [] } = {}) {
    try {
      let query = api.from(view).select(select);
      filters.forEach(({ column, value }) => {
        if (value !== undefined && value !== null && value !== "") query = query.eq(column, value);
      });
      if (order) query = query.order(order, { ascending });
      return unwrap(await query, `read:${view}`) || [];
    } catch (error) {
      logger?.warn("api.read.failed", { view, code: error?.code });
      throw mapPlatformError(error, { operation: `read:${view}` });
    }
  }

  async function rpc(name, payload = {}) {
    try {
      return unwrap(await api.rpc(name, payload), `rpc:${name}`);
    } catch (error) {
      logger?.warn("api.rpc.failed", { rpc: name, code: error?.code });
      throw mapPlatformError(error, { operation: `rpc:${name}` });
    }
  }

  return Object.freeze({
    getProfile: async () => (await read("my_profile", { select: "*" }))[0] || null,
    getEnrolments: () => read("my_enrolments", { order: "joined_on" }),
    getAssignments: () => read("my_assignments", { order: "activity_key" }),
    getCurriculumDelivery: () => read("my_activity_delivery", { order: "sort_order" }),
    getAttempts: (activityKey) => read("my_attempts", {
      order: "received_at",
      ascending: false,
      filters: [{ column: "activity_key", value: activityKey }]
    }),
    getResponses: (activityKey) => read("my_responses", {
      order: "received_at",
      ascending: false,
      filters: [{ column: "activity_key", value: activityKey }]
    }),
    getProgress: (activityKey) => read("my_activity_progress", {
      filters: [{ column: "activity_key", value: activityKey }]
    }),
    getRegistrationOptions: () => rpc("registration_options"),
    completeOnboarding: (payload) => rpc("complete_learner_onboarding", payload),
    submitAttempt: (payload) => rpc("submit_attempt", payload),
    getPublishedCurriculum: () => rpc("published_curriculum"),
    getPublishedCurriculumPackage: (hubCode, courseKey) => rpc("published_curriculum_package", {
      p_hub_code: hubCode,
      p_course_key: courseKey
    })
  });
}
