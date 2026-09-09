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

const CODE_MESSAGES = Object.freeze({
  invalid_credentials: "Email or password is incorrect.",
  email_not_confirmed: "Confirm your email before signing in.",
  over_email_send_rate_limit: "Too many account emails have been requested. Please wait a few minutes and try again.",
  user_already_exists: "An account with this email already exists. Sign in with your existing email and password.",
  email_exists: "An account with this email already exists. Sign in with your existing email and password.",
  invalid_class_key: "Could not join your class. Check the registration key and try again.",
  student_number_already_linked: "That Student ID is already linked to another learning account. Sign in with that account, or use your own Student ID.",
  onboarding_conflict: "Your signed-in account does not match that learner profile. Sign in with the account you used before, or contact your tutor.",
  auth_account_already_linked: "Your signed-in account does not match that learner profile. Sign in with the account you used before, or contact your tutor.",
  profile_required: "Finish creating your learner profile before joining a class."
});

const OPERATION_MESSAGES = Object.freeze({
  "sign-in": "We couldn't sign you in. Please try again.",
  "sign-up": "We couldn't create your account. Please try again."
});

const CODE_RULES = Object.freeze([
  [/AUTH|CREDENTIAL|SESSION|EMAIL_NOT_CONFIRMED|RATE_LIMIT|AUTH_ACCOUNT_ALREADY_LINKED/i, "authentication"],
  [/PERMISSION|FORBIDDEN|RLS|42501/i, "authorisation"],
  [/STUDENT_NUMBER|ONBOARDING_CONFLICT|INVALID|VALIDATION|REQUIRED|MISMATCH/i, "validation"],
  [/NETWORK|FETCH|TIMEOUT|ABORT|OFFLINE/i, "network"],
  [/SUBMIT|ATTEMPT|ASSIGNMENT|ACTIVITY_VERSION/i, "submission"],
  [/CONFIG|SUPABASE_URL|PUBLISHABLE_KEY/i, "configuration"]
]);

function apiCodeFrom(error) {
  const candidates = [error?.code, error?.message, error?.details, error?.hint];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (/^[A-Z][A-Z0-9_]+$/.test(value) && !/^[A-Z0-9]{5}$/.test(value)) return value;
  }
  return String(error?.code || error?.name || "PLATFORM_ERROR");
}

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

function messageForCode(code) {
  return CODE_MESSAGES[String(code || "").toLowerCase()] || null;
}

export function mapPlatformError(error, overrides = {}) {
  if (error instanceof PlatformError && Object.keys(overrides).length === 0) return error;

  const sourceCode = String(overrides.code || apiCodeFrom(error) || "PLATFORM_ERROR");
  const category = overrides.category || categoryFor(sourceCode, error);
  const learnerMessage = overrides.learnerMessage
    || messageForCode(sourceCode)
    || OPERATION_MESSAGES[overrides.operation]
    || DEFAULT_MESSAGES[category];
  return new PlatformError({
    code: sourceCode,
    category,
    learnerMessage,
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
