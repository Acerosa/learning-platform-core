# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## [Unreleased]

### Changed

- Sign-in asks only for username and password. Registration asks for first name,
  last name, Student ID, email and password, without a confirm-password field.
- Form fields that use the `hidden` attribute are not shown, so sign-in no
  longer displays the registration form.

### Added

- `@learning-platform/core/curriculum-runtime` with `createPublishedCurriculumService`,
  hub-scoped cache keys, publication version selection, schema gates and shared
  fallback policy. `createPlatform` exposes the same service as `platform.curriculum`.
  Optional `courseKey` on platform configuration identifies the published course.
- Learner API helpers for `published_curriculum` metadata and
  `published_curriculum_package` teaching-package reads.
- Architecture notes that Core must not own React presentation, curriculum
  schemas or Admin behaviour; platform-wide design lives in the backend
  architecture document.

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
