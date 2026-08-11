export const ERROR_CATEGORIES = Object.freeze([
  "authentication",
  "authorisation",
  "validation",
  "network",
  "submission",
  "configuration",
  "platform",
  "unexpected"
]);

const DEFAULT_MESSAGES = Object.freeze({
  authentication: "Sign in to continue.",
  authorisation: "Your account does not have access to this action.",
  validation: "Check the information you entered and try again.",
  network: "The learner service could not be reached. Check your connection and try again.",
  submission: "Your work could not be submitted. It remains available for you to retry.",
  configuration: "This learning hub is not configured correctly. Contact your tutor.",
  platform: "The learner service could not complete that request. Try again shortly.",
  unexpected: "Something went wrong. Try again or contact your tutor."
});

const CODE_RULES = Object.freeze([
  [/AUTH|CREDENTIAL|SESSION|EMAIL_NOT_CONFIRMED/i, "authentication"],
  [/PERMISSION|FORBIDDEN|RLS|42501/i, "authorisation"],
  [/INVALID|VALIDATION|REQUIRED|MISMATCH/i, "validation"],
  [/NETWORK|FETCH|TIMEOUT|ABORT|OFFLINE/i, "network"],
  [/SUBMIT|ATTEMPT|ASSIGNMENT|ACTIVITY_VERSION/i, "submission"],
  [/CONFIG|SUPABASE_URL|PUBLISHABLE_KEY/i, "configuration"]
]);

export class PlatformError extends Error {
  constructor({
    code = "UNEXPECTED_ERROR",
    category = "unexpected",
    learnerMessage,
    diagnostic = {},
    cause
  } = {}) {
    const safeCategory = ERROR_CATEGORIES.includes(category) ? category : "unexpected";
    super(learnerMessage || DEFAULT_MESSAGES[safeCategory], cause ? { cause } : undefined);
    this.name = "PlatformError";
    this.code = String(code || "UNEXPECTED_ERROR");
    this.category = safeCategory;
    this.learnerMessage = learnerMessage || DEFAULT_MESSAGES[safeCategory];
    this.diagnostic = Object.freeze({ ...diagnostic });
  }

  toJSON() {
    return {
      code: this.code,
      category: this.category,
      learnerMessage: this.learnerMessage
    };
  }
}

function categoryFor(code, error) {
  if (error?.status === 401) return "authentication";
  if (error?.status === 403) return "authorisation";
  if (error?.status === 0) return "network";
  const match = CODE_RULES.find(([pattern]) => pattern.test(code));
  return match ? match[1] : "platform";
}

export function mapPlatformError(error, overrides = {}) {
  if (error instanceof PlatformError && Object.keys(overrides).length === 0) return error;

  const sourceCode = String(overrides.code || error?.code || error?.name || "PLATFORM_ERROR");
  const category = overrides.category || categoryFor(sourceCode, error);
  return new PlatformError({
    code: sourceCode,
    category,
    learnerMessage: overrides.learnerMessage || DEFAULT_MESSAGES[category],
    diagnostic: {
      operation: overrides.operation || null,
      status: Number.isFinite(error?.status) ? error.status : null,
      sourceCode
    },
    cause: error
  });
}

export function learnerMessageFor(category) {
  return DEFAULT_MESSAGES[ERROR_CATEGORIES.includes(category) ? category : "unexpected"];
}
