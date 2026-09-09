# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## [Unreleased]

### Added

- Hub-scoped Supabase Auth persistence. `createPlatform()` / `createSupabaseClient()`
  store the learner session under `sb-<project-ref>-auth-token--<hubCode>` so
  same-origin GitHub Pages hubs no longer share one browser login. Sign-out uses
  `{ scope: "local" }` and does not clear other hubs or `localStorage` wholesale.
  Existing shared sessions are not copied; learners sign in once per hub.
  `createAuthStorageKey()` is exported from `@learning-platform/core/advanced`.
  Hub-scoped storage is not an authorisation boundary.

## 0.2.12 - 2026-09-09

### Added

- Hub-scoped learner access: `createPlatform()` resolves `api.resolve_learner_hub_access`
  from `auth.uid()` plus the hub's own code/course key. Readiness no longer treats
  any active enrolment as enough for the current hub. `enrolled_created` remains
  a ready status, including when the learner already has an unrelated hub
  enrolment. After `enrolled_created` or `enrolled_reactivated`, learner context
  is refreshed so the header and group fields follow the hub enrolment without a
  page reload. `platform.assignments.getHubAssignments(hubCode)` reads
  `api.my_hub_assignments`. `getAssignments()` still reads the unscoped
  `api.my_assignments` compatibility view. Onboarding hides the year/group picker
  when the hub resolver returns exactly one eligible registration key.

## 0.2.11 - 2026-09-08

### Fixed

- Checked in-progress drafts always upsert through `saveActivityState`. Practice
  `completed` flags, official `submission.status = submitted`, and result objects
  no longer skip the server save or call `clearActivityState`. Question retry
  replaces the current response map. Explicit `store.clear()` remains the reset
  path. Browser cache with `{ remote: false }` still stays local.

## 0.2.10 - 2026-09-08

### Added

- Authenticated in-progress activity state through `platform.progress.getActivityState`,
  `saveActivityState`, `clearActivityState` and `createStore`. Server state is
  authoritative. Browser storage is cache, resilience, or unauthenticated fallback.
  Completing an activity cancels a pending in-progress upload so autosave cannot
  reopen the draft.

## 0.2.9 - 2026-09-08

### Fixed

- Formative `markBlock` maps `ACTIVITY_NOT_ASSIGNED`, missing learner identity,
  and unavailable activity/question versions to specific learner-safe messages
  instead of always showing the generic check-failed copy.

## 0.2.8 - 2026-09-07

### Changed

- Sign-in asks for email, not a username, with short helper copy for returning and new learners.
- Create account labels email and Student ID separately so students can see which value is used to sign in.

### Fixed

- Sign-in validates email format before calling Auth, so a student ID is not sent as an email.
- Auth maps `invalid_credentials`, `email_not_confirmed` and `over_email_send_rate_limit` to learner-safe messages. Unknown sign-in and sign-up failures stay generic.

## 0.2.7 - 2026-09-06

### Added

- Session visibility helpers in `@learning-platform/core/curriculum-runtime`:
  `isSessionAvailable`, `isSessionAccessible`, `overlayLiveSessionMetadata`,
  `overlayLivePackageMetadata` and `sessionsFromPublication`. Live session
  `metadata.status` overlays bundled packages without replacing structure.
  A session is learner-accessible only when the parent week and the session
  are both `available`.

## 0.2.6 - 2026-09-01

### Fixed

- Optional `resolveFormativeContract` on `createPlatform` lets hubs canonicalise
  formative activity versions and question keys before `mark_formative_response`
  payloads are built. Default behaviour remains identity passthrough.

## 0.2.5 - 2026-09-01

### Fixed

- Email confirmation redirects now return learners to the originating hub via
  `options.emailRedirectTo`, derived from trusted `hubRootPath`, instead of the
  Supabase project Site URL.

### Security

- Reject cross-origin and open-redirect style auth callback targets. Remove auth
  token material from the address bar only after session recovery.

## 0.2.4 - 2026-09-01

### Added

- Server-marked formative feedback via `createFormativeMarkingService` / `platform.marking.markBlock`.
  Lost or failed check retries reuse the same `clientCheckId`; a changed response or a completed check starts a new one.

### Security

- Immediate formative feedback and practice scores are server-marked. Formative checks are analytics records, not official assessment attempts.

## 0.2.3 - 2026-08-31

### Security

- Shared authored-HTML renderer (`setAuthoredHtml`, `isUnsafeAuthoredHtml`) and `resolveActivityVersion` for catalogue versions. Missing or invalid versions fail closed.
- Hub Security scanner recognises the approved renderer. Vendored snapshots and hub codegen scripts are not treated as learner production source. Invented `1.0.0` / `latest` version fallbacks are flagged. Check severity is unchanged.

## 0.2.1 - 2026-08-28

### Changed

- Sign-in asks only for username and password. Registration asks for first name,
  last name, Student ID, email and password, without a confirm-password field.
- Form fields that use the `hidden` attribute are not shown, so sign-in no
  longer displays the registration form.

### Added

- Shared week visibility helpers in `@learning-platform/core/curriculum-runtime`:
  `isWeekAvailable`, `overlayLiveWeekMetadata` and `weeksFromPublication`.
- `@learning-platform/core/curriculum-runtime` package export with
  `createPublishedCurriculumService`, hub-scoped cache keys, publication version
  selection, schema gates and shared fallback policy.
- Learner API helpers for `published_curriculum` metadata and
  `published_curriculum_package` teaching-package reads.

## 0.1.0 - 2026-08-11

### Added

- Initial factory-based platform composition API.
- Supabase Auth/session integration and learner-safe `api` schema client.
- Registration, onboarding, learner context, profile, enrolment, assignment and backend progress services.
- Strict evidence-only submission service with idempotent retry support.
- Neutral evidence helpers for eight common activity evidence types.
- Canonical platform states, structured errors, redacted logging, feature flags and hub configuration.
- Framework-free learner header, navigation, account/onboarding, modal, notification, loading, error, progress, activity and empty-state components.
- Light, dark and system themes with semantic tokens and hub branding overrides.
- Stable ES module and IIFE builds, a non-stable advanced ES module, and a conformance build.
- Unit, integration, accessibility, conformance and public-contract tests.
- Pull-request and `main` quality workflow covering install, checks, conformance, audit and package contents.
- Architecture, integration, migration, security, conformance, public API and compatibility documentation.

### Changed

- Narrowed the package root and browser global to the documented stable API.
- Moved low-level service, SDK, API, logging and submission-policy factories to `@learning-platform/core/advanced`.
- Removed the raw Supabase client, internal API adapter and logger from the returned platform object.
- Standardised the platform facade on plural `assignments` and `enrolments` services.
- Pinned the supported and tested Supabase JS dependency exactly to 2.112.3.

### Compatibility

- ES2020 browsers.
- Static GitHub Pages hosting.
- Supabase JS 2.112.3 supplied by the consuming hub.

### Notes

This is a release-prepared initial development version, not a published or production-certified release. Neither audited hub is migrated by this version.
