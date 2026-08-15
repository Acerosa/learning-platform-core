# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## [Unreleased]

### Added

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
- ES module, IIFE and conformance builds.
- Unit, integration, accessibility and conformance tests.
- Architecture, integration, migration, security and conformance documentation.

### Compatibility

- ES2020 browsers.
- Static GitHub Pages hosting.
- Supabase JS 2.x supplied by the consuming hub.

### Notes

This is an initial development release. Neither audited hub is migrated by this release.
