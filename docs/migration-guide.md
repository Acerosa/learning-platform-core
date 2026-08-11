# Migration guide

Adopt the shared layer incrementally. Do not replace every hub subsystem in one release.

## Preconditions

- The hub has a Hub Manifest and declares the core/platform compatibility version.
- Hosted Supabase exposes the approved `api` views and RPCs used by the core.
- Registration options and onboarding are deployed and tested.
- The backend accepts evidence-only responses and calculates or validates authoritative results.
- The existing hub has a rollback point and a passing baseline test suite.

## Recommended sequence

### 1. Add versioned assets and configuration

Copy one exact `dist/` version into a platform asset directory or install an exact package version. Add hub code/name, public Supabase settings, routes, feature flags and branding without removing existing behaviour.

### 2. Adopt theme and low-risk UI primitives

Load shared tokens, map existing colours to `--hub-primary` and `--hub-accent`, then adopt loading, error, toast, modal and card components. Verify light, dark, system, reduced-motion and mobile layouts.

### 3. Replace navigation and learner header

Configure the six standard navigation sections, allowing unfinished routes to remain disabled. Mount the shared learner header from backend learner context. Do not copy profile fields into a hub-owned session object.

### 4. Replace authentication and session restoration

Inject the existing Supabase client or an exact Supabase JS `createClient` function. Enable the shared auth/session service behind a feature flag. Remove custom token REST fallbacks only after equivalent session restore, refresh, sign-out and confirmation tests pass.

### 5. Replace registration and onboarding

Adopt the account dialog and onboarding service. Test immediate-session signup, confirmation-required signup, returning incomplete onboarding, leading-zero Student IDs, empty registration options, duplicate linkage and network retry.

Remove hard-coded group lists and any direct learner/enrolment table writes.

### 6. Replace profile, enrolment, assignment and progress reads

Switch reads to named shared API services. Compare backend-derived progress to existing UI for a controlled test learner. Treat mismatches as migration defects; do not preserve local progress as authority.

### 7. Replace submission one activity family at a time

Translate activity output into neutral evidence helpers. Submit only the eight approved top-level fields. Preserve a single client attempt ID across retries. Confirm backend idempotency and that no identity/assignment/score fields appear in requests.

Keep browser drafts until the corresponding backend attempt is verified. Remove legacy submission paths after all supported activities pass contract tests.

### 8. Enable conformance and remove duplicates

Run the shared conformance suite in hub CI, then remove local platform copies. Finish with security, accessibility, responsive, performance, documentation and deployment review.

## Source-hub considerations from the audits

### Unit 3 Cyber Security Hub

Reusable strengths include staged authenticated onboarding, controlled registration options, full learner identity summary, safe RPC naming, structured evidence and stable retry IDs. Migration must not carry forward:

- subject-prefixed storage keys or activity-key maps;
- Apps Script submission paths;
- week-specific submit runners;
- optional or uneven Supabase wiring by week;
- browser-local authoritative progress;
- response correctness/marks supplied as backend authority.

### T Level Digital Software Development Hub

Reusable strengths include light/dark/system behaviour, accessible semantic tokens, responsive shared shell patterns, activity renderer separation and programming editor/checker/feedback boundaries. Migration must not carry forward:

- legacy student-ID sessions or Apps Script result submission;
- browser-owned learner copies;
- local correctness/awarded marks as authoritative platform data;
- subject routes, branding or programming teaching content inside the core;
- unpinned runtime dependencies.

## Rollback

Keep each core release in its own versioned asset directory. A static hub rollback should change the referenced core asset directory to the previous tested version and redeploy the prior hub commit. Package consumers should restore the previous lockfile/package version. Never roll back backend data by replacing it with browser state.

## Completion criteria

A hub migration is complete only when local platform copies are removed, the manifest declares the exact version, compatibility tests pass, submissions contain no identity or authoritative score, progress is backend-derived, accessibility/responsive checks pass, release notes and rollback instructions exist, and the hub completes full LHDS review.
