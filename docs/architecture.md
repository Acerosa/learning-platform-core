# Architecture

## Responsibility boundary

The core package owns reusable platform behaviour. A hub owns learning content and presentation choices that are genuinely subject-specific.

| Shared platform core | Individual hub |
| --- | --- |
| Authentication and session restoration | Curriculum and learning outcomes |
| Registration and onboarding | Learning resources and assessments |
| Learner context and header | Subject-specific activity data |
| Approved API client | Specialist renderers where justified |
| Submission and evidence envelope | Subject branding token values |
| Backend-derived progress | Subject guidance and pedagogy |
| Errors, loading, notifications and navigation | Route availability and subject additions |
| Theme behaviour and semantic tokens | Hub manifest and curriculum metadata |

The package contains no backend migrations. It expects the shared Supabase backend to expose the approved browser-facing `api` schema.

## Trust boundary

The browser is an untrusted presentation and evidence-capture client.

- Supabase Auth establishes a session. The SDK owns token storage and refresh.
- Backend functions derive identity from `auth.uid()`.
- The browser never selects or submits learner, enrolment or assignment IDs as authority.
- Registration options come from `api.registration_options()` after authentication.
- Onboarding writes only through `api.complete_learner_onboarding(...)`.
- Submission writes only through `api.submit_attempt(...)`.
- The submission service accepts a strict allow-list and converts neutral evidence into an evidence-only response envelope.
- Backend responses may include authoritative attempt number, score and progress, but the browser never sends those values as authority.
- Progress is read from backend views. Local storage is not consulted by the progress service.

Pending onboarding is the sole profile-like temporary state owned by the package. It uses session storage, is scoped by hub code, excludes email and password, and is deleted after successful onboarding.

## Service layout

```text
createPlatform()
├── config and feature flags
├── Supabase client (injected SDK/client)
├── learner-safe API (`api` schema)
├── auth and session
├── profile and enrolment
├── learner context
├── onboarding
├── assignment and curriculum delivery
├── progress, attempts and responses
├── submission and evidence
├── platform state
├── safe errors and redacted logger
└── theme
```

Each service is also exported as a factory for isolated testing or gradual migration. `createPlatform()` is the convenience composition root.

## State model

The canonical states are:

```text
loading
signed-out
signing-in
registration-required
onboarding-required
authenticated
no-enrolment
no-assignments
ready
offline
error
```

`authenticated` is a transient valid state while enrolments and assignments are being evaluated. `ready` means an authenticated learner has a profile, at least one enrolment and at least one assignment. The state store is observable and exposes immutable snapshots.

## API architecture

`createLearnerApi()` fixes the schema to `api` and exposes named operations instead of a generic table selector:

- `getProfile()`
- `getEnrolments()`
- `getAssignments()`
- `getCurriculumDelivery()`
- `getAttempts(activityKey)`
- `getResponses(activityKey)`
- `getProgress(activityKey)`
- `getRegistrationOptions()`
- `completeOnboarding(payload)`
- `submitAttempt(payload)`

This reduces accidental access to private implementation schemas and keeps the frontend contract auditable.

## UI architecture

Shared components use native DOM APIs and return small controllers with an `element` property. They require no framework and do not use subject data. Text is assigned with `textContent`, reducing injection risk.

Components share semantic HTML, accessible names, keyboard and Escape behaviour, visible focus tokens, minimum touch target sizing, responsive layouts, reduced-motion handling and light/dark semantic tokens with hub branding overrides.

The learner header subscribes to learner context. It keeps the last authenticated display during a context refresh, clears on sign-out and never persists identity itself.

## Distribution architecture

The same ES module source produces:

- a bundled ES module for module scripts and future package managers;
- an IIFE build for current static sites;
- a separate conformance entry;
- standalone CSS token and component files.

Supabase JS is external and injected. This avoids forcing a hub's dependency-loading strategy while allowing a package consumer to import an exact compatible SDK version.

## Deliberate differences from the source hubs

- No REST fallback stores custom auth tokens in local storage; Supabase JS is the sole session owner.
- No legacy Apps Script/student-ID authentication path.
- No hub-specific activity keys, question aliases or colour values.
- No client-owned correctness, awarded mark, total score or progress calculation in the shared submission path.
- No hard-coded registration options.
- One canonical platform state vocabulary replaces hub-specific status names.
- UI factories are independent of curriculum renderers and can be adopted route by route.
