# Public API specification

This document defines the supported `0.2.0` contract for hub developers. It is normative for package consumers.

API classifications:

- **STABLE** — supported for hub integration within the documented `0.1.x` compatibility policy.
- **ADVANCED** — available for exceptional composition and platform testing; may change before `1.0.0`.
- **INTERNAL** — implementation detail. It is not exported through a package entry point and must not be used by hubs.

## 1. Package entry point — STABLE

```js
import { createPlatform, evidence } from "@learning-platform/core";
```

The default ESM entry and the `LearningPlatformCore` browser global expose the same stable names. Low-level service factories are intentionally absent.

Purpose: provide the supported orchestration, evidence, theme, UI, constants, errors and conformance APIs needed by hubs.

Lifecycle: import once per page/application runtime. Do not deep-import source files.

Security: use the returned service façades. The stable entry provides no raw database/query constructor.

## 2. `createPlatform()` — STABLE

```js
const platform = createPlatform(config, { createClient });
await platform.initialise();
```

Parameters:

- `config` — the configuration object described below.
- `dependencies.createClient` — the tested Supabase JS `createClient` function for ESM/package use. Omit it when the exact supported browser SDK is already available as `window.supabase`.

Return value: an immutable platform façade containing config, services, state, theme and lifecycle functions.

Lifecycle:

- Call `initialise()` after mounting essential page structure.
- Subscribe to `state`, `auth` or `learner` before or immediately after initialisation.
- Call `destroy()` when a single-page application permanently unmounts the platform.
- A traditional multi-page static hub may rely on page teardown.

Security:

- The function accepts only public Supabase project configuration.
- The raw Supabase client and low-level API façade are not returned.
- Test-only dependency injection keys are internal and are not a hub integration contract.

## 3. Configuration object — STABLE

```js
const config = {
  hubCode: "example-hub",
  hubName: "Example Hub",
  platformVersion: "0.1",
  accountPath: "./account/",
  supabase: {
    projectUrl: "https://PROJECT.supabase.co",
    publishableKey: "PUBLIC_PUBLISHABLE_KEY"
  },
  navigation: [{ id: "home", path: "./" }],
  navigationMode: "standard",
  features: { sharedProgress: true },
  theme: { primary: "#315b7d", accent: "#4f7695" }
};
```

Required parameters: `hubCode` in kebab-case and a non-empty `hubName`.

Return/normalisation: `platform.config` is immutable, fixes `apiSchema` to `api`, and records `navigationMode`. The default `navigationMode` is `"standard"`: all six standard navigation definitions are present, unused routes are disabled, and extra items are appended. `"as-supplied"` keeps the hub array order and does not inject unused standard routes. Routes without a path are disabled in `"standard"` mode and rejected in `"as-supplied"` mode.

Security: the only permitted schema is `api`. Configuration must never contain a service-role key, password, token or learner identity.

## 4. Returned platform services — STABLE

Canonical shape:

```text
platform.config
platform.auth
platform.session
platform.learner
platform.onboarding
platform.profile
platform.enrolments
platform.assignments
platform.progress
platform.submission
platform.state
platform.theme
platform.features
platform.initialise()
platform.destroy()
```

The object is frozen. Singular `assignment`/`enrolment`, raw-client, low-level API and logger properties are not part of the public shape.

Service details not expanded in later sections:

- `platform.session` restores the auth state with `restore()`, returns the SDK-managed session through `getSession()`, reports a boolean through `hasActiveSession()`, delegates `signOut()`, and provides `subscribe(listener)`. It returns state snapshots, the current session, booleans or unsubscribe functions as appropriate. Use `platform.initialise()` for normal startup and keep subscriptions only for the mounted lifetime. Auth subscriptions are emitted when session state changes. Never log, copy or persist the returned session, and never treat the browser boolean as authorisation.
- `platform.profile.getProfile()` returns the learner-scoped backend profile or `null`. Call it only after authentication when a one-off raw profile refresh is necessary; normal UI should prefer learner context. It emits no events. Returned identity is display data and must not be persisted or used as browser authority.
- `platform.enrolments.getEnrolments()` returns learner-scoped backend enrolment rows. Call it after authentication; normal UI should prefer the normalised enrolments already present in learner context. It emits no events. IDs or membership received by the browser must not be resubmitted as authorisation.

## 5. Theme API — STABLE

Top-level exports: `createThemeService`, `applyBranding`, `THEME_MODES`, `THEME_EVENT`.

`createThemeService(options?)` returns:

- `getPreference()` → `"light" | "dark" | "system"`.
- `getResolvedTheme(mode?)` → `"light" | "dark"`.
- `setPreference(mode)` → applied theme snapshot.
- `apply()` → current applied snapshot.
- `subscribe(listener)` → unsubscribe function; listener receives `{ preference, resolvedTheme }`.
- `destroy()` → removes system-theme listeners.

Lifecycle: `createPlatform()` creates `platform.theme` automatically in a browser. Direct construction is supported for UI-only previews.

Events: applying a theme dispatches `learningplatform:themechange` (`THEME_EVENT`) on `document`.

Security: theme storage contains only the mode string. `applyBranding(root, { primary, accent })` must receive validated six-digit hex colours from trusted hub configuration.

## 6. State API — STABLE

`platform.state` provides:

- `getState()` → immutable `{ status, detail, changedAt }` snapshot.
- `transition(status, detail?)` → next snapshot.
- `subscribe(listener)` → unsubscribe function.

`PLATFORM_STATES` contains the canonical state vocabulary.

Lifecycle: application code normally observes state; platform services perform normal transitions.

Security: never put tokens, passwords or raw backend objects in `detail`.

## 7. Auth API — STABLE

`platform.auth` provides:

- `initialise()` → restored auth-state snapshot.
- `signIn(email, password)` → authenticated state snapshot.
- `signUp(email, password)` → `{ user, session, needsConfirmation }` from Supabase Auth.
- `signOut()` → `true` after local state is cleared.
- `subscribe(listener)` → unsubscribe function.
- `getState()` → current auth snapshot.
- `getSession()` → current SDK-managed session or `null`.
- `isSignedIn()` → boolean.

Lifecycle: use `platform.initialise()` for normal restoration rather than calling auth initialisation separately.

Events: subscribers receive loading, signing-in, authenticated, signed-out and error states.

Security: do not log, copy or persist the returned Auth user/session object. Passwords are passed directly to Supabase Auth and are never stored by the core; Supabase JS remains the sole session owner.

## 8. Onboarding API — STABLE

`platform.onboarding` provides:

- `validateProfile(details)` → `{ ok, value? , code? }`.
- `validateAccount(details)` → validation result.
- `savePending(details)` → safe pending profile subset.
- `getPending()` → safe pending subset or `null`.
- `clearPending()` → clears recoverable pending state.
- `getRegistrationOptions()` → controlled backend options.
- `complete(details, registrationKey)` → onboarding result.
- `pendingKey` → namespaced session-storage key.

Lifecycle: authenticate first, then load registration options and complete onboarding. Pending state supports an email-confirmation boundary.

Security: pending storage contains only first name, surname, Student ID and optional registration key. Options are backend-controlled; identity is derived server-side.

## 9. Learner context API — STABLE

`platform.learner` provides:

- `initialise()` → initial context state.
- `refresh()` → refreshed context state.
- `subscribe(listener)` → unsubscribe function.
- `getState()` → `{ status, context, error }`.
- `getContext()` → backend-derived learner context or `null`.

Context includes full/display name, contact email, year/academic year, group and active enrolments.

Lifecycle: the platform refreshes context after authentication and onboarding. The learner header retains the last authenticated display during refresh.

Security: context is presentation data, not browser authority. Do not copy it into independent persistent storage.

## 10. Assignment API — STABLE

`platform.assignments` provides:

- `getAssignments()` → backend assignment rows.
- `getCurriculumDelivery()` → learner-safe delivery rows.

Lifecycle: fetch after learner context is authenticated. `createPlatform()` uses assignments to derive `ready`/`no-assignments` state.

Security: assignments come from approved learner-scoped API views. A hub must not choose an internal assignment ID for authorisation.

## 11. Progress API — STABLE

`platform.progress` provides:

- `getProgress(activityKey?)` → backend progress rows.
- `getAttempts(activityKey?)` → backend attempt rows.
- `getResponses(activityKey?)` → backend response rows.

Lifecycle: call after authentication. Refresh after a successful submission where immediate UI updates are required.

Security: results are backend authority. Local browser draft state must not be merged into authoritative completion, attempts or scores.

## 12. Submission API — STABLE

`platform.submission` provides:

- `buildPayload(input)` → immutable approved RPC payload.
- `submit(input)` → backend submission result.
- `getAttemptId(activityKey)` → stable retry ID.
- `beginAttempt(activityKey)` → a new attempt ID.
- `allowedFields` → approved input field list.

Input fields: `activityKey`, `activityVersion`, `clientAttemptId`, `responses`, `sourcePage`, `startedAt`, `completedAt`, `programmingLanguage`.

Lifecycle: retain the same attempt ID across retries; start a new one only for a deliberate new attempt. Successful submission clears the stored retry ID.

Security: unknown fields and identity, enrolment, assignment, attempt-number and score fields are rejected. Source queries/fragments are removed. Evidence does not send authoritative correctness or awarded marks.

## 13. Evidence helpers — STABLE

`evidence` contains:

- `singleChoice(questionKey, optionId)`
- `multiSelect(questionKey, optionIds)`
- `matching(questionKey, pairs)`
- `ordering(questionKey, itemIds)`
- `written(questionKey, text)`
- `reflection(questionKey, text)`
- `coding(questionKey, sourceCode, options?)`
- `classification(questionKey, categoryId, itemId?)`

Return value: an immutable neutral evidence object accepted by the submission service. `EVIDENCE_TYPES` lists the stable type identifiers.

Lifecycle: construct evidence from the current activity response immediately before saving a draft or submitting.

Security: question keys belong to the hub; evidence helpers do not accept identity or authoritative score fields.

## 14. UI component entry points — STABLE

Stable factories:

- `createLearnerHeader({ document?, learnerContext, authService, config })`
- `createNavigationShell({ document?, config, currentId?, currentIds?, themeService?, brandTitle?, brandTagline?, actions? })`
- `createHubShell({ document?, config, currentId?, themeService?, brandTitle?, brandTagline?, actions?, breadcrumbs?, pageHeader?, footer?, learnerHeader?, learnerContext?, authService? })`
- `createBreadcrumbs({ document?, items, resolveHref? })`
- `createAccountDialog({ document?, authService, learnerContext, onboardingService })`
- `createOnboardingView({ document?, onboardingService, onComplete? })`
- `createModal({ document?, id?, title? })`
- `createToastRegion({ document?, timeoutMs? })`
- `createLoadingState({ document?, message? })`
- `createErrorBanner({ document?, heading?, message? })`
- `createProgressCard(options)`
- `createActivityCard({ title, description?, activityType?, duration?, status?, state?, href?, actionLabel?, badge?, badgeStatus?, headingLevel? })`
- `createEmptyState(options)`
- `createStatusBadge({ status, label?, marker? })`
- `createCallout({ tone?, title?, message? })`
- `createContextPanel({ contextType, heading?, items?, description?, action? })`
- `createLearningOutcomeBadge({ id?, title? })`
- `createWeekHeader(options)`
- `createWeekNavigation({ previousWeek?, nextWeek? })`
- `createSessionSection({ id?, title, kind?, summary?, defaultOpen?, meta?, children? })`
- `createWeekView({ week, learningOutcomes?, context?, sessions?, progress?, previousWeek?, nextWeek?, features?, renderActivity? })`

Presentation constants: `NAVIGATION_MODES`, `CONTEXT_TYPES`, `SESSION_KINDS`, `SESSION_KIND_LABELS`, `LEARNER_ACTIVITY_STATES`, `STATUS_TONES`, `WEEK_UI_FEATURES`, `mergeWeekUiFeatures`.

Week, session and activity factories consume presentation objects. They must not be passed curriculum envelopes, question banks or hub identity. See [Shared hub UI](hub-ui.md).

Return value: components return an element or an immutable controller with `element` and documented control methods.

Lifecycle: append the element to the document; call `destroy()` for controllers when unmounting in a single-page application.

Events: components use native click, change, keyboard and form events. Notifications use ARIA live regions.

Security: pass learner-facing text, not raw backend errors. Components use DOM text assignment for dynamic content.

## 15. Conformance API — STABLE

Exports: `runConformanceChecks(input)` and `assertConformant(input)`, available from both the default entry and `@learning-platform/core/conformance`.

Return value: `runConformanceChecks` returns `{ passed, errors, warnings, results }`. `assertConformant` returns the report or throws `ConformanceError` with the report.

Lifecycle: run in hub CI with a manifest, navigation, service façade, representative secure submission and optional theme root.

Security: this is a contract check, not a replacement for backend/RLS or human security review.

## 16. Error model — STABLE

Exports: `PlatformError` and `ERROR_CATEGORIES`.

A platform error exposes `code`, `category`, `learnerMessage`, safe `diagnostic`, and `toJSON()`.

Lifecycle: show only `learnerMessage` in learner UI. Operational monitoring may use the stable code/category.

Security: `toJSON()` omits diagnostic context and causes. Never show a raw Supabase/database error.

## 17. Feature flags — STABLE

`platform.features` provides:

- `isEnabled(name)` → boolean.
- `getAll()` → immutable flag map.
- `set(values)` → updated immutable map.
- `subscribe(listener)` → unsubscribe function.

Lifecycle: initialise flags from hub configuration and use them for deliberate incremental rollout. Persisting flags is a hub/platform deployment concern, not a learner profile concern.

Security: flags are UX/deployment controls, not authorisation.

## 18. Browser build usage — STABLE

Load `dist/theme.css`, the exact supported Supabase JS browser SDK, and `dist/learning-platform-core.iife.js`. The global name is `LearningPlatformCore` and matches the default ESM exports.

No runtime bundler, npm installation or framework is required. Do not load `advanced.esm.js` as a normal hub script.

## 19. Stability guarantees

`0.2.0` is pre-1.0 integration-ready software, not production certification.

- Stable names and documented object shapes will not change in a patch release without a compatibility fix and changelog entry.
- A deliberate `0.x` minor release may make breaking changes before first hub migration; those changes require migration notes.
- After `1.0.0`, breaking stable API changes require a major release.
- Deprecations will normally remain for at least one minor release after `1.0.0`.
- CSS custom properties prefixed `--lp-`, hub branding tokens and documented `.lp-*` component classes follow the same policy.

## 20. Advanced and internal APIs

### `@learning-platform/core/advanced` — ADVANCED

This ESM-only entry exposes low-level constructors for platform tests and exceptional composition, including configuration, Supabase client/API, individual services, state, logging, error mapping and submission validation.

It is not part of the stable hub contract and is intentionally absent from the browser global. It may change before `1.0.0`. Importing it requires an explicit code-review justification.

The raw Supabase constructor available here does not grant permission to bypass the approved API façade. Direct private-table access remains prohibited.

### Source modules and composition internals — INTERNAL

Files under `src/core`, injected test dependencies, the composed raw client, the low-level API instance, logger implementation and orchestration listeners are internal. They are omitted from published package files or stable exports.

Hubs must not depend on source paths, object identity, undocumented fields or build implementation details.
