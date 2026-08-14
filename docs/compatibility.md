# Compatibility policy

## Release maturity

Version `0.2.0` is an additive learner-UI release on the integration-ready 0.x line. It is not an LHDS production certification or an npm publication.

## Runtime support

- ES2020-capable evergreen browsers.
- Static GitHub Pages applications.
- Native ES modules or the supplied IIFE browser build.
- Node.js 20 or later for development, build and tests.
- No frontend framework or runtime package manager requirement.

## Supabase JS policy

The tested and supported SDK version for `0.2.0` is exactly:

```text
@supabase/supabase-js 2.112.3
```

It is pinned as both a development dependency and peer compatibility declaration. Static hubs must vendor or load that exact audited browser version.

An SDK upgrade requires a deliberate core change, lockfile update, full quality run, browser-build validation, changelog entry and a new core release. Compatibility with arbitrary earlier or future 2.x releases is not claimed.

## Platform/backend compatibility

The core targets platform API compatibility `0.1` and the approved `api` schema described in the integration and security documentation. Live hosted-backend certification remains a migration prerequisite.

## Build compatibility

- `dist/learning-platform-core.esm.js` — stable ESM API.
- `dist/learning-platform-core.iife.js` — stable browser global API.
- `dist/advanced.esm.js` — advanced, non-stable ESM only.
- `dist/conformance.esm.js` — stable conformance API.
- `dist/theme.css` and `dist/tokens.css` — static CSS assets.

## Change policy

Patch releases preserve the documented stable names and object shape. Pre-1.0 minor releases may make reviewed breaking changes with migration notes. No production-certification claim is implied by package compatibility alone.
