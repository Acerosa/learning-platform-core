# Security model

## Browser trust

The browser captures evidence and renders platform data. It is not authoritative for identity, enrolment, permissions, assignment selection, attempt numbering, marks or progress.

The backend must continue to enforce authentication, Row-Level Security, ownership and validation. Frontend checks improve feedback but are never access control.

## Authentication

- Use Supabase Auth only.
- Supply a public publishable/anonymous key; never ship a service-role key.
- Let the official SDK persist and refresh the auth session.
- Do not create a parallel token store.
- Do not log sessions, access tokens, refresh tokens, passwords or cookies.

## Data access

`createLearnerApi()` accepts only the `api` schema and exposes fixed view/RPC names. The core does not provide a generic private-table query method.

Backend permissions remain mandatory even when a view or RPC is named by the core.

## Onboarding data

The account form handles passwords only long enough to call Supabase Auth. Pending onboarding storage contains only first name, surname, Student ID as text and an optional controlled registration key.

It uses session storage, not long-lived profile storage, and is cleared after successful onboarding. Integrations should also clear it on a deliberate account reset/sign-out.

## Submission allow-list

The shared input contract contains activity key, activity version, client attempt ID, evidence responses, source page path, started timestamp, completed timestamp and optional programming language.

Unknown top-level fields are rejected. Explicit learner, student, enrolment, assignment, attempt-number and score fields are rejected. Query strings and fragments are removed from source pages to reduce accidental PII leakage.

Evidence contains learner responses only. The core does not send `is_correct`, `awarded_score`, total score or maximum score. A hub may calculate provisional feedback locally, but the backend must not treat it as authority.

## Logging and errors

The logger redacts common secret and PII keys, bearer strings and email patterns. It limits object depth/size and serialises errors to name/code only. Avoid passing raw backend objects to the logger in the first place.

Learners receive a stable error code/category and plain message. Diagnostic context is for development/monitoring and is omitted from `PlatformError.toJSON()`.

## Security review checklist

- Search built assets for service-role keys and unexpected credentials.
- Verify every browser query targets `api`.
- Inspect a real submission request for the eight approved keys.
- Test idempotent duplicate requests.
- Test anonymous, wrong-user and expired-session requests.
- Verify onboarding derives Auth identity server-side.
- Confirm RLS remains enabled and tested.
- Confirm source paths contain no identity query parameters.
- Run dependency audit and update exact runtime pins deliberately.
- Review CSP, HTTPS, dependency integrity and deployment headers in each consuming hub.
