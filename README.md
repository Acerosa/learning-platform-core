# Learning Platform Core

`@learning-platform/core` is the framework-free shared frontend layer for learner-facing Learning Platform hubs. It centralises platform behaviour—authentication, onboarding, learner context, approved API access, submissions, progress, common UI and theming—while leaving curriculum, activities and subject branding inside each hub.

Version: **0.2.0** (additive shared hub UI release).

## What is included

- Supabase client creation through the tested Supabase JS 2.112.3 SDK.
- Authentication, session restoration and auth-state subscription.
- Staged registration, email-confirmation recovery and authenticated onboarding.
- Backend-derived learner context, profile, enrolment, assignment and progress services.
- A learner-safe `api` schema client.
- An evidence-only submission contract with stable client attempt IDs and idempotent retries.
- Neutral evidence builders for single choice, multi-select, matching, ordering, written response, reflection, coding and classification.
- Canonical platform states, safe errors, redacted logging, configuration and feature flags.
- Learner header, hub shell, navigation, breadcrumbs, week/session/activity presentation, account/onboarding dialog, modal, loading state, error banner, notifications, progress card, status badge, callout and empty state.
- Light, dark and system themes with persistent preference, system-change tracking and hub branding overrides.
- A reusable LHDS-oriented conformance runner.

It deliberately contains no curriculum documents, question banks, subject colour schemes, OCR/P/M/D language, or activity-block rendering. Week presentation consumes hub-mapped data only. See [Shared hub UI](docs/hub-ui.md).

## Architecture at a glance

The public API is centred on `createPlatform()`. A hub supplies configuration and the exact supported SDK's `createClient` function (or loads that SDK before the browser bundle). The returned platform object owns no backend data and never exposes the raw SDK client or a generic query surface; it coordinates browser-safe services around the approved `api` schema.

```text
Hub configuration and curriculum
             │
             ▼
@learning-platform/core ── shared DOM components and theme
             │
             ▼
        Supabase JS SDK
             │
             ▼
    approved `api` schema only
             │
             ▼
 backend identity, enrolment, marking and progress authority
```

See [Architecture](docs/architecture.md) for the trust boundary and service layout.

## Install for development

```bash
npm install
npm run check
```

`npm run check` creates the distributable builds and runs unit, integration, accessibility and conformance tests.

Build outputs:

- `dist/learning-platform-core.esm.js` — bundled ES module.
- `dist/learning-platform-core.iife.js` — browser global named `LearningPlatformCore`.
- `dist/advanced.esm.js` — explicitly non-stable low-level factories for exceptional integrations.
- `dist/conformance.esm.js` — standalone conformance entry.
- `dist/theme.css` and `dist/tokens.css` — shared visual layer.

## Static browser usage

Existing GitHub Pages hubs do not need to adopt npm bundling. Copy the versioned files from `dist/` into the hub's platform assets, load Supabase JS 2.112.3, then load the IIFE bundle.

```html
<link rel="stylesheet" href="./platform/0.1.0/theme.css">
<script src="./vendor/supabase-js-2.112.3.min.js"></script>
<script src="./platform/0.1.0/learning-platform-core.iife.js"></script>
<script>
  const platform = LearningPlatformCore.createPlatform({
    hubCode: "example-hub",
    hubName: "Example Learning Hub",
    supabase: {
      projectUrl: "https://PROJECT.supabase.co",
      publishableKey: "PUBLIC_PUBLISHABLE_KEY"
    },
    navigation: [
      { id: "home", path: "./" },
      { id: "learning", path: "./learning/" },
      { id: "activities", path: "./activities/" },
      { id: "resources", path: "./resources/" },
      { id: "progress", path: "./progress/" },
      { id: "account", path: "./account/" }
    ],
    theme: { primary: "#315b7d", accent: "#4f7695" }
  });

  platform.initialise();
</script>
```

The Supabase publishable/anonymous key is a public browser credential. A service-role key, database password or other privileged secret must never be supplied.

## ES module and future package usage

The package is not published yet. Once a registry release exists, install both packages at their tested versions:

```bash
npm install @learning-platform/core@0.1.0 @supabase/supabase-js@2.112.3
```

Future bundled hubs can then use:

```js
import { createClient } from "@supabase/supabase-js";
import {
  createPlatform,
  createNavigationShell,
  createLearnerHeader
} from "@learning-platform/core";
import "@learning-platform/core/theme.css";

const platform = createPlatform(config, { createClient });

document.querySelector("[data-navigation]").append(
  createNavigationShell({ config: platform.config, themeService: platform.theme }).element
);
document.querySelector("[data-learner-header]").append(
  createLearnerHeader({
    learnerContext: platform.learner,
    authService: platform.auth,
    config: platform.config
  }).element
);

await platform.initialise();
```

See [Integration](docs/integration.md) for complete auth, onboarding, submission and progress examples.

## Public API and stability

The official stable surface is the package root and the `LearningPlatformCore` browser global. It contains the platform composition root, approved UI factories, evidence builders, theme contracts and conformance helpers. The canonical platform facade exposes named services such as `assignments`, `enrolments`, `progress` and `submission`; it does not expose the raw Supabase client, the internal API adapter or the logger.

Low-level composition factories are isolated at `@learning-platform/core/advanced`. That entry is intentionally non-stable and is not included in the browser global. Application code should use it only when the stable facade cannot meet a documented integration need.

See the formal [Public API contract](docs/public-api.md) and [Compatibility policy](docs/compatibility.md).

## Theme configuration

The core theme defines semantic `--lp-*` tokens and maps brand accents through two hub-owned tokens:

```css
:root {
  --hub-primary: #315b7d;
  --hub-accent: #4f7695;
}
```

The platform config applies equivalent `theme.primary` and `theme.accent` values at runtime. Theme preference defaults to `system`, persists only `light`, `dark` or `system`, updates `data-theme` and `data-theme-preference` on `<html>`, reacts to system changes in system mode, and publishes `learningplatform:themechange`.

## Security rules

- Query only the approved `api` schema; private learning tables are rejected by configuration.
- Let Supabase JS own authentication token persistence and refresh.
- Never store passwords. Pending onboarding uses `sessionStorage` and contains only first name, surname, Student ID and an optional registration key.
- Never treat browser-stored profile, enrolment, marks or progress as authoritative.
- Submit only activity key/version, client attempt ID, evidence responses, source path, timestamps and optional programming language.
- Never submit learner identity, enrolment/assignment IDs, attempt number or authoritative scores.
- Preserve the client attempt ID after a failed request so a retry remains idempotent.
- Keep service-role keys and raw backend errors out of browser code and learner messages.
- Treat redacted logs as operational hints, not a data store.

See [Security](docs/security.md) for the detailed trust boundary.

## Conformance checks

Future hubs can import `@learning-platform/core/conformance` and run:

```js
const report = runConformanceChecks({
  manifest,
  navigation: platform.config.navigation,
  services: platform,
  submissionPayload: representativePayload,
  documentRoot: document.documentElement
});
```

The initial runner checks manifest fields, standard navigation definitions, shared-service availability, the submission trust boundary and theme state. It complements—not replaces—human security, accessibility, performance and curriculum review. See [Conformance](docs/conformance.md).

## Versioning and compatibility

- Semantic Versioning is used.
- `0.x` is an integration-development line; minor releases may contain breaking changes, which will be called out in the changelog and migration guide.
- After `1.0.0`, breaking public API or CSS contract changes require a major release.
- A deprecated API will normally remain for at least one minor release before removal.
- Supported runtime target: ES2020-capable browsers, static hosting/GitHub Pages and Supabase JS 2.112.3.
- Hubs should copy or install an exact core version and declare that version in their Hub Manifest.

## Development and release

Pull requests and pushes to `main` run the quality workflow: exact lockfile install, syntax/build/test checks, conformance tests, a high-severity dependency audit and a package dry run. A release should pass the same checks, update `CHANGELOG.md`, build `dist/`, tag the semantic version and document rollback to the previous versioned asset directory or package version.

This repository is a library, not a deployed hub. It has no production deployment target.

## Known limitations before hub migration

- Unit 14 now consumes the 0.2.0 shared hub UI. Unit 3 and T Level are not migrated by this release.
- Version 0.2.0 is release-prepared shared UI, not production-certified.
- Password reset, password change and profile editing are not included in the 0.1.0 account surface.
- Live compatibility against the hosted shared Supabase project has not been exercised by this repository.
- The backend must accept evidence-only responses and remain authoritative for correctness and marks before a hub can remove its client-marking compatibility fields.
- Full browser/device matrices, real screen-reader testing and production performance budgets remain release/certification work.
- The conformance runner is an initial contract suite, not complete LHDS certification automation.

For safe adoption, follow the [Migration guide](docs/migration-guide.md).
