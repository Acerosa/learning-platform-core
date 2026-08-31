# Hub Security Baseline v1.0

This is the versioned security contract for Learning Platform learner hubs. It is independent of curriculum package version.

Public documentation states the guarantees below. Enforcement lives in the shared platform packages, tests, and the hub CI check. Do not copy security rules into hub-local engines, and do not treat this page as an implementation guide.

## Guarantees

Hubs that pin this baseline:

- authoritative submissions require authentication
- learner identity is server-resolved
- scoring is server-authoritative
- published versions are immutable
- client-side state is not authoritative
- hubs conform to the shared Hub Security Baseline rather than inventing a parallel security model

## Adoption

Pin `learningPlatform.securityBaseline` to `"1.0"` in the hub `package.json` and run `npm run check:hub-security` in CI.

A hub README may link here. It should not list internal controls, exceptions, or enforcement mechanics.

## Versioning

Future contract changes bump this baseline deliberately (`1.1`, `2.0`). Do not tie bumps to curriculum publication versions.
