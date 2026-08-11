# Integration guide

## 1. Configure and initialise

Supply stable hub metadata, routes, public Supabase configuration and brand tokens. Only routes with a path are displayed; all six standard navigation definitions remain present in config for gradual adoption.

```js
const platform = LearningPlatformCore.createPlatform({
  hubCode: "example-hub",
  hubName: "Example Hub",
  accountPath: "./account/",
  supabase: {
    projectUrl: window.HUB_PUBLIC_CONFIG.supabaseUrl,
    publishableKey: window.HUB_PUBLIC_CONFIG.supabasePublishableKey
  },
  navigation: [
    { id: "home", path: "./" },
    { id: "activities", path: "./activities/" },
    { id: "account", path: "./account/" }
  ],
  features: { sharedProgress: true },
  theme: { primary: "#315b7d", accent: "#4f7695" }
});

platform.state.subscribe(({ status }) => {
  document.body.dataset.platformState = status;
});

await platform.initialise();
```

Do not put a service-role key in `HUB_PUBLIC_CONFIG`.

## 2. Mount navigation and theme controls

```js
const navigation = LearningPlatformCore.createNavigationShell({
  config: platform.config,
  currentId: document.body.dataset.page,
  themeService: platform.theme
});
document.querySelector("[data-platform-navigation]").append(navigation.element);
```

The theme selector reads and writes only the mode string. Hub colours are CSS custom properties, not learner data.

## 3. Mount the learner header

```js
const header = LearningPlatformCore.createLearnerHeader({
  learnerContext: platform.learner,
  authService: platform.auth,
  config: platform.config
});
document.querySelector("[data-learner-header]").append(header.element);
```

The header shows full name, year group, contact email, current hub, Account and Sign out only while learner context exists.

## 4. Account and onboarding

```js
const account = LearningPlatformCore.createAccountDialog({
  authService: platform.auth,
  learnerContext: platform.learner,
  onboardingService: platform.onboarding
});
document.body.append(account.element);

document.querySelector("[data-open-account]").addEventListener("click", (event) => {
  account.open(event.currentTarget);
});
```

Registration is intentionally staged:

1. Collect first name, surname, Student ID, email and password.
2. Save only safe pending learner details in session storage.
3. Create the Supabase Auth account using email/password.
4. If email confirmation is required, wait for confirmation and sign-in.
5. Once authenticated, load controlled registration options.
6. Call the onboarding RPC.
7. Refresh learner context and clear pending state.

An existing authenticated account without a learner profile enters `onboarding-required` and can resume the same flow. Passwords are never persisted by the package.

## 5. Read assignments and progress

```js
const [assignments, progress] = await Promise.all([
  platform.assignment.getAssignments(),
  platform.progress.getProgress()
]);
```

Render backend results with shared cards. Do not merge them with local-storage totals or promote browser draft state to authoritative completion.

```js
mount.append(LearningPlatformCore.createProgressCard({
  title: "Assigned activities",
  completed: progress.filter((row) => row.completed).length,
  total: assignments.length
}));
```

## 6. Build neutral evidence

```js
const responses = [
  LearningPlatformCore.evidence.singleChoice("Q1", "option-b"),
  LearningPlatformCore.evidence.multiSelect("Q2", ["option-a", "option-c"]),
  LearningPlatformCore.evidence.written("Q3", answerText),
  LearningPlatformCore.evidence.coding("Q4", sourceCode, { language: "python", output })
];
```

Question keys and activity metadata stay in the hub. Evidence builders do not determine authoritative correctness or marks.

## 7. Submit an attempt

```js
const attemptId = platform.submission.getAttemptId(activity.key);

const result = await platform.submission.submit({
  activityKey: activity.key,
  activityVersion: activity.version,
  clientAttemptId: attemptId,
  responses,
  sourcePage: window.location.pathname,
  startedAt,
  completedAt: new Date(),
  programmingLanguage: selectedLanguage || null
});
```

On failure, retry the same input. The attempt ID remains in session storage and makes the retry idempotent. On success, it is cleared. Call `beginAttempt(activity.key)` only when the learner deliberately starts a new attempt.

The service rejects unknown input fields and all identity, enrolment, assignment, attempt-number and score fields.

## 8. Handle errors and notifications

```js
try {
  await platform.submission.submit(input);
} catch (error) {
  errorHost.replaceChildren(LearningPlatformCore.createErrorBanner({
    message: error.learnerMessage
  }));
  platform.logger.warn("activity.submit.failed", { code: error.code });
}
```

Never show `error.cause`, raw Supabase messages or diagnostic context to a learner.

## 9. Clean up

Single-page applications should call component `destroy()` methods and `platform.destroy()` when unmounting. Multi-page static hubs may rely on normal page teardown.
