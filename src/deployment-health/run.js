import { probeBrowserBoot } from "./browser-probe.js";
import { probePublishedCurriculum } from "./curriculum-probe.js";
import { checkPagesDeploymentSource } from "./pages-source.js";
import { formatHealthReport, summariseChecks } from "./result.js";
import { isPropagationFailure, withBoundedRetries } from "./retry.js";
import { probeStaticDeployment } from "./static-probe.js";

function defaultRetries(config = {}) {
  const retries = config.retries || {};
  return {
    attempts: Math.max(1, Number(retries.attempts) || 6),
    delayMs: Math.max(0, Number(retries.delayMs) || 10_000)
  };
}

export async function runPagesHealthChecks(config = {}, options = {}) {
  const name = config.name || config.baseUrl || "target";
  const kind = String(config.kind || "learner-hub");
  const retries = defaultRetries(config);
  const all = [];

  if (kind === "docs-only") {
    all.push({
      id: "pages.docs-only",
      passed: true,
      severity: "info",
      message: "Documentation-only Pages target; app deployment health checks were not run.",
      details: null
    });
    const report = summariseChecks(all);
    return Object.freeze({
      ...report,
      target: name,
      kind,
      formatted: formatHealthReport(report, { targetName: name })
    });
  }

  const sourceCheck = await checkPagesDeploymentSource(config, options);
  all.push(sourceCheck);

  const staticOutcome = await withBoundedRetries(
    async () => probeStaticDeployment(config, options),
    {
      attempts: retries.attempts,
      delayMs: retries.delayMs,
      sleep: options.sleep,
      shouldRetry: (outcome) => Boolean(outcome?.retryable)
        && (outcome.results || []).some((item) => !item.passed && isPropagationFailure(item))
    }
  );
  all.push(...(staticOutcome.results || []));

  const curriculumOutcome = await withBoundedRetries(
    async () => probePublishedCurriculum(config, options),
    {
      attempts: Math.min(retries.attempts, 4),
      delayMs: retries.delayMs,
      sleep: options.sleep,
      shouldRetry: (outcome) => Boolean(outcome?.retryable)
    }
  );
  all.push(...(curriculumOutcome.results || []));

  const browserOutcome = await withBoundedRetries(
    async () => probeBrowserBoot(config, options),
    {
      attempts: Math.min(retries.attempts, 4),
      delayMs: retries.delayMs,
      sleep: options.sleep,
      shouldRetry: (outcome) => Boolean(outcome?.retryable)
    }
  );
  all.push(...(browserOutcome.results || []));

  // HTML 200 must never be the sole pass signal.
  const substantive = all.filter((item) => item.id !== "pages.html");
  const htmlOnlyHealthy = all.some((item) => item.id === "pages.html" && item.passed)
    && substantive.every((item) => item.passed || item.severity === "info" || item.severity === "warning")
    && !substantive.some((item) => item.passed && item.severity !== "info" && [
      "pages.assets.present",
      "pages.mime",
      "pages.boot",
      "curriculum.retrieval"
    ].includes(item.id));

  if (htmlOnlyHealthy) {
    all.push({
      id: "pages.not-html-only",
      passed: false,
      severity: "error",
      message: "Refusing to report healthy from HTML 200 alone; asset/boot/curriculum evidence is missing.",
      details: null
    });
  } else {
    all.push({
      id: "pages.not-html-only",
      passed: true,
      severity: "info",
      message: "Health decision includes asset, boot, and/or curriculum evidence beyond HTML 200.",
      details: null
    });
  }

  const report = summariseChecks(all);
  return Object.freeze({
    ...report,
    target: name,
    kind,
    attempts: {
      static: staticOutcome.attempt,
      curriculum: curriculumOutcome.attempt,
      browser: browserOutcome.attempt
    },
    formatted: formatHealthReport(report, { targetName: name })
  });
}

export async function runPagesHealthFleet(targets = [], options = {}) {
  const reports = [];
  for (const target of targets) {
    reports.push(await runPagesHealthChecks(target, options));
  }
  const failed = reports.filter((report) => !report.passed);
  return Object.freeze({
    passed: failed.length === 0,
    reports: Object.freeze(reports),
    failed: Object.freeze(failed)
  });
}
