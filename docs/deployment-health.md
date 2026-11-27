# GitHub Pages deployment health checks

Reusable probes for Learning Platform hubs and the Central Admin Portal. They
verify that a GitHub Actions Pages deployment is serving the compiled app, not a
documentation-only / source / broken artifact.

```bash
npm run build
node dist/deployment-health.mjs --config path/to/pages-health.json
```

Or:

```js
import { runPagesHealthChecks } from "@learning-platform/core/deployment-health";

const report = await runPagesHealthChecks(config, {
  skipBrowser: false,
  publishableKey: process.env.LP_SUPABASE_PUBLISHABLE_KEY
});
```

## What is checked

| Check | Meaning |
| --- | --- |
| `pages.source` | GitHub Pages `build_type` is `workflow` (Actions artifact), not a legacy branch/docs root |
| `pages.html` | HTML is reachable (never sufficient alone) |
| `pages.no-typescript-source` | Production HTML does not reference `.tsx` / `.ts` / `.jsx` |
| `pages.assets.present` | Compiled JS assets are referenced |
| `pages.mime` | JS assets return a JavaScript Content-Type (not `text/html`) |
| `pages.base-path` | Optional expected Pages path |
| `pages.boot` | Browser mount into `#root` (Playwright) |
| `pages.fatal-errors` | No unexpected page/console fatals during boot |
| `curriculum.retrieval` | Anon `api.published_curriculum_package` succeeds |
| `curriculum.version` | Optional expected package version pin |
| `curriculum.browser-source` | `data-curriculum-source=published` (not bundled fallback) |
| `pages.not-html-only` | Refuses a healthy verdict from HTML 200 alone |

Documentation-only targets set `"kind": "docs-only"` and are skipped without
mutating those deployments.

## Propagation delays

`retries.attempts` / `retries.delayMs` bound post-deploy waits. Failures that look
like CDN propagation (missing assets, wrong MIME, empty boot) are retried;
permanent failures (TypeScript source refs, version mismatches) are not.

## Browser dependency

Boot / white-page / fatal-error checks use Playwright when available
(`optionalDependencies.playwright`). CI should install Chromium:

```bash
npx playwright install --with-deps chromium
```

Use `--skip-browser` for lightweight scheduled HTTP+RPC checks.

## Security

Public health checks use only the publishable Supabase key and unauthenticated
Pages URLs. They never expose answer keys, staff packages, or learner credentials.
Staff operational diagnostics (missing learner packages, marking coverage) live in
`admin_api` views and the Central Admin Portal.
