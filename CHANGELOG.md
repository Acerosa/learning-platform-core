# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## [Unreleased]

### Added

- Advanced learner API helpers for `published_curriculum` metadata and
  `published_curriculum_package` teaching-package reads.

## 0.2.0 - 2026-08-14

### Added

- Shared hub learner UI primitives: hub shell, breadcrumbs, week header/navigation/view, session section, context panel, learning-outcome badge, status badge and callout.
- Presentation contracts for week, session kinds and activity cards, driven by configuration rather than hub identity.
- `navigationMode: "as-supplied"` so hubs can keep a custom primary navigation order without Core injecting unused standard routes.
- Navigation brand title/tagline and an actions slot for account controls.
- Activity card start/resume/completed actions and optional status badges.
- Hub UI documentation and tests for variants, keyboard behaviour, responsive CSS contracts and backward-compatible navigation.

### Changed

- Package version is `0.2.0`. Existing `0.1.0` factories keep their names and default behaviour.

### Compatibility

- Additive public API. Default `navigationMode` remains `"standard"`.
- `createActivityCard` still defaults to “Open activity” when `state` is omitted.
- Existing Core consumers do not need to change until they adopt the new primitives.
- Hubs that vendor Core should copy `dist/` into a `0.2.0` asset directory.

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
