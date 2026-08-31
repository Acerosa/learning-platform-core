# Platform conformance runner

The conformance entry provides quick, reusable contract checks for future hubs:

```js
import { runConformanceChecks } from "@learning-platform/core/conformance";
```

It currently checks minimum Hub Manifest fields, standard navigation definitions, shared-service availability, representative submission inputs and document theme state.

```js
const report = runConformanceChecks({
  manifest,
  navigation: platform.config.navigation,
  services: platform,
  submissionPayload,
  documentRoot: document.documentElement
});

if (!report.passed) {
  console.table(report.results);
  throw new Error("Platform conformance failed");
}
```

Use `assertConformant(input)` when CI should throw automatically. An error makes `report.passed` false; warnings identify incomplete optional evidence.

## What this does not certify

The runner does not replace backend/RLS security review, live API compatibility tests, curriculum review, manual keyboard and screen-reader testing, full WCAG 2.2 AA review, responsive device matrices, performance budgets, or deployment/monitoring review.

Those remain required LHDS certification gates. The runner is intentionally small at version 0.1.0 and should grow only when a contract is stable across hubs.

## Hub Security Baseline v1

Learner hubs run the Node scanner (no network):

```bash
npm run check:hub-security
```

This executes `@learning-platform/core/hub-security` (`dist/hub-security.mjs`). It is separate from the browser conformance bundle so it can read hub source files. See [Hub Security Baseline v1](hub-security-baseline-v1.md).
