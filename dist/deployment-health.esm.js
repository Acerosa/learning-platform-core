// src/deployment-health/result.js
function checkResult(id, passed, message, severity = "error", details = null) {
  return Object.freeze({
    id,
    passed: Boolean(passed),
    severity,
    message: String(message || ""),
    details: details == null ? null : Object.freeze(details)
  });
}
function summariseChecks(results) {
  const list = Array.isArray(results) ? results : [];
  const errors = list.filter((item) => !item.passed && item.severity === "error").length;
  const warnings = list.filter((item) => !item.passed && item.severity === "warning").length;
  return Object.freeze({
    passed: errors === 0,
    errors,
    warnings,
    results: Object.freeze(list.map((item) => Object.freeze(item)))
  });
}
function formatHealthReport(report, { targetName = "" } = {}) {
  const lines = [];
  const title = targetName ? `Pages health: ${targetName}` : "Pages health";
  lines.push(`${title} \u2014 ${report.passed ? "PASS" : "FAIL"} (${report.errors} error(s), ${report.warnings} warning(s))`);
  for (const item of report.results || []) {
    const mark = item.passed ? "OK" : item.severity === "warning" ? "WARN" : "FAIL";
    lines.push(`  [${mark}] ${item.id}: ${item.message}`);
  }
  return lines.join("\n");
}

// src/deployment-health/retry.js
function sleep(ms, sleepFn) {
  return new Promise((resolve2) => sleepFn(ms, resolve2));
}
async function withBoundedRetries(task, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const sleepFn = options.sleep || ((ms, done) => setTimeout(done, ms));
  const shouldRetry = typeof options.shouldRetry === "function" ? options.shouldRetry : (outcome) => Boolean(outcome?.retryable);
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await task({ attempt, attempts });
    if (!shouldRetry(last) || attempt === attempts) {
      return { ...last, attempt, attempts };
    }
    if (delayMs > 0) await sleep(delayMs, sleepFn);
  }
  return { ...last, attempt: attempts, attempts };
}
function isPropagationFailure(check) {
  if (!check || check.passed) return false;
  const id = String(check.id || "");
  return id.startsWith("pages.html") || id.startsWith("pages.assets") || id.startsWith("pages.mime") || id.startsWith("pages.boot") || id === "pages.unreachable";
}

// src/deployment-health/urls.js
function ensureTrailingSlash(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value : `${value}/`;
}
function joinUrl(baseUrl, relativePath) {
  const raw = String(relativePath || "");
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) {
    return new URL(raw, new URL(baseUrl).origin).toString();
  }
  const base = ensureTrailingSlash(baseUrl);
  const path = raw.replace(/^\.\//, "");
  return new URL(path, base).toString();
}
function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
function extractModuleAssetPaths(html) {
  const source = String(html || "");
  const paths = [];
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while (match = scriptRe.exec(source)) {
    const tag = match[0];
    const src = match[1];
    if (/\btype=["']module["']/i.test(tag) || /\.js(?:\?|$)/i.test(src)) {
      paths.push(src);
    }
  }
  return paths;
}
function htmlReferencesTypeScriptSource(html) {
  const source = String(html || "");
  return /(?:src|href)=["'][^"']+\.(?:tsx|ts|jsx)(?:\?[^"']*)?["']/i.test(source) || /src\/main\.(?:tsx|ts|jsx)/i.test(source);
}
function isJavascriptMime(contentType) {
  const value = String(contentType || "").toLowerCase();
  return value.includes("javascript") || value.includes("ecmascript") || value === "text/js";
}
function looksLikeHtmlBody(body) {
  const sample = String(body || "").slice(0, 200).toLowerCase();
  return sample.includes("<!doctype html") || sample.includes("<html");
}

// src/deployment-health/pages-source.js
async function checkPagesDeploymentSource(config = {}, options = {}) {
  const repository = String(config.repository || "").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
  const expected = String(config.pages?.expectedSource || "workflow").toLowerCase();
  const kind = String(config.kind || "learner-hub");
  const fetchFn = options.fetch || globalThis.fetch;
  const token = options.githubToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (kind === "docs-only") {
    return checkResult(
      "pages.source",
      true,
      "Target is marked docs-only; Pages source enforcement is skipped.",
      "info"
    );
  }
  if (!repository) {
    return checkResult(
      "pages.source",
      false,
      "No repository configured for Pages source verification.",
      "warning"
    );
  }
  if (typeof fetchFn !== "function") {
    return checkResult("pages.source", false, "fetch is unavailable for Pages source check.", "warning");
  }
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "learning-platform-pages-health"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetchFn(`https://api.github.com/repos/${repository}/pages`, { headers });
    if (response.status === 404) {
      return checkResult(
        "pages.source",
        false,
        token ? `GitHub Pages is not enabled for ${repository}.` : `GitHub Pages API returned 404 for ${repository}. Provide GITHUB_TOKEN to verify workflow deployment source.`,
        token ? "error" : "warning"
      );
    }
    if (response.status === 401 || response.status === 403) {
      return checkResult(
        "pages.source",
        false,
        `GitHub Pages API not readable for ${repository} (HTTP ${response.status}). Provide GITHUB_TOKEN for this check.`,
        "warning"
      );
    }
    if (!response.ok) {
      return checkResult(
        "pages.source",
        false,
        `GitHub Pages API failed for ${repository} (HTTP ${response.status}).`,
        "warning"
      );
    }
    const body = await response.json();
    const buildType = String(body.build_type || "").toLowerCase();
    const sourceBranch = body.source?.branch || null;
    const sourcePath = body.source?.path || null;
    const ok = expected === "workflow" ? buildType === "workflow" : buildType === expected;
    if (ok) {
      return checkResult(
        "pages.source",
        true,
        `Pages build_type is ${buildType || "unknown"} as expected.`,
        "info",
        { buildType, sourceBranch, sourcePath, htmlUrl: body.html_url || null }
      );
    }
    return checkResult(
      "pages.source",
      false,
      `Pages build_type is "${buildType || "legacy/unknown"}" (branch=${sourceBranch || "?"}, path=${sourcePath || "?"}); expected "${expected}".`,
      "error",
      { buildType, sourceBranch, sourcePath }
    );
  } catch (error) {
    return checkResult(
      "pages.source",
      false,
      `Pages source check failed: ${error?.message || error}`,
      "warning"
    );
  }
}

// src/deployment-health/static-probe.js
async function readResponse(response) {
  const contentType = response.headers?.get?.("content-type") || response.headers?.get?.("Content-Type") || "";
  const text = typeof response.text === "function" ? await response.text() : "";
  return { contentType, text, status: response.status, ok: response.ok };
}
async function probeStaticDeployment(config = {}, options = {}) {
  const results = [];
  const fetchFn = options.fetch || globalThis.fetch;
  const baseUrl = String(config.baseUrl || "").trim();
  const kind = String(config.kind || "learner-hub");
  if (kind === "docs-only") {
    results.push(checkResult(
      "pages.html",
      true,
      "docs-only target skipped static app deployment probes.",
      "info"
    ));
    return { results, html: "", assetUrls: [], retryable: false };
  }
  if (!baseUrl) {
    results.push(checkResult("pages.html", false, "baseUrl is required."));
    return { results, html: "", assetUrls: [], retryable: false };
  }
  if (typeof fetchFn !== "function") {
    results.push(checkResult("pages.html", false, "fetch is unavailable."));
    return { results, html: "", assetUrls: [], retryable: false };
  }
  let htmlResponse;
  try {
    htmlResponse = await fetchFn(baseUrl, {
      headers: { Accept: "text/html", "User-Agent": "learning-platform-pages-health" },
      redirect: "follow"
    });
  } catch (error) {
    results.push(checkResult(
      "pages.unreachable",
      false,
      `Failed to fetch ${baseUrl}: ${error?.message || error}`
    ));
    return { results, html: "", assetUrls: [], retryable: true };
  }
  const htmlPayload = await readResponse(htmlResponse);
  if (!htmlResponse.ok) {
    results.push(checkResult(
      "pages.html",
      false,
      `HTML returned HTTP ${htmlPayload.status} for ${baseUrl}.`
    ));
    return { results, html: htmlPayload.text, assetUrls: [], retryable: true };
  }
  results.push(checkResult(
    "pages.html",
    true,
    `HTML reachable (HTTP ${htmlPayload.status}). Note: HTTP 200 alone is not sufficient.`,
    "info"
  ));
  if (htmlReferencesTypeScriptSource(htmlPayload.text)) {
    results.push(checkResult(
      "pages.no-typescript-source",
      false,
      "Production HTML references undeployed TypeScript/JSX source (e.g. main.tsx)."
    ));
  } else {
    results.push(checkResult(
      "pages.no-typescript-source",
      true,
      "Production HTML does not reference TypeScript/JSX sources."
    ));
  }
  const expectedBasePath = config.pages?.basePath ? String(config.pages.basePath) : "";
  if (expectedBasePath) {
    const actualPath = pathnameOf(htmlResponse.url || baseUrl);
    const normalisedExpected = expectedBasePath.endsWith("/") ? expectedBasePath : `${expectedBasePath}/`;
    const normalisedActual = actualPath.endsWith("/") ? actualPath : `${actualPath}/`;
    const pathOk = normalisedActual === normalisedExpected || normalisedActual.endsWith(normalisedExpected) || normalisedExpected.endsWith(normalisedActual);
    results.push(checkResult(
      "pages.base-path",
      pathOk,
      pathOk ? `Deployment path ${normalisedActual} matches expected base path.` : `Deployment path ${normalisedActual} does not match expected base path ${normalisedExpected}.`
    ));
  }
  const assetPaths = extractModuleAssetPaths(htmlPayload.text);
  if (!assetPaths.length) {
    results.push(checkResult(
      "pages.assets.present",
      false,
      "No compiled JS module assets were referenced from production HTML."
    ));
    return { results, html: htmlPayload.text, assetUrls: [], retryable: true };
  }
  results.push(checkResult(
    "pages.assets.present",
    true,
    `Found ${assetPaths.length} script asset reference(s).`
  ));
  const assetUrls = assetPaths.map((path) => joinUrl(htmlResponse.url || baseUrl, path));
  let mimeFailures = 0;
  let missingAssets = 0;
  for (const assetUrl of assetUrls) {
    let assetResponse;
    try {
      assetResponse = await fetchFn(assetUrl, {
        headers: { Accept: "*/*", "User-Agent": "learning-platform-pages-health" },
        redirect: "follow"
      });
    } catch (error) {
      missingAssets += 1;
      results.push(checkResult(
        "pages.assets.fetch",
        false,
        `Asset fetch failed for ${assetUrl}: ${error?.message || error}`
      ));
      continue;
    }
    const assetPayload = await readResponse(assetResponse);
    if (!assetResponse.ok) {
      missingAssets += 1;
      results.push(checkResult(
        "pages.assets.fetch",
        false,
        `Asset ${assetUrl} returned HTTP ${assetPayload.status}.`
      ));
      continue;
    }
    const mimeOk = isJavascriptMime(assetPayload.contentType) && !looksLikeHtmlBody(assetPayload.text);
    if (!mimeOk) {
      mimeFailures += 1;
      results.push(checkResult(
        "pages.mime",
        false,
        `Asset ${assetUrl} returned Content-Type "${assetPayload.contentType || "missing"}" (expected JavaScript). HTML bodies usually mean a broken base path or missing dist deploy.`
      ));
    }
  }
  if (mimeFailures === 0 && missingAssets === 0) {
    results.push(checkResult(
      "pages.mime",
      true,
      "Compiled JS assets return JavaScript MIME types."
    ));
    results.push(checkResult(
      "pages.assets.fetch",
      true,
      "All referenced JS assets were fetched successfully."
    ));
  }
  return {
    results,
    html: htmlPayload.text,
    assetUrls,
    retryable: missingAssets > 0 || mimeFailures > 0
  };
}

// src/deployment-health/curriculum-probe.js
function firstRow(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload && typeof payload === "object") return payload;
  return null;
}
async function probePublishedCurriculum(config = {}, options = {}) {
  const results = [];
  const curriculum = config.curriculum || {};
  const kind = String(config.kind || "learner-hub");
  if (kind === "docs-only" || curriculum.enabled === false) {
    results.push(checkResult(
      "curriculum.retrieval",
      true,
      "Curriculum retrieval checks skipped for this target.",
      "info"
    ));
    return { results, row: null, retryable: false };
  }
  const hubCode = String(curriculum.hubCode || "").trim();
  const courseKey = String(curriculum.courseKey || "").trim();
  const projectUrl = String(
    curriculum.supabaseUrl || options.supabaseUrl || process.env.LP_SUPABASE_URL || process.env.SUPABASE_URL || ""
  ).replace(/\/+$/, "");
  const keyEnv = curriculum.publishableKeyEnv || "LP_SUPABASE_PUBLISHABLE_KEY";
  const publishableKey = String(
    options.publishableKey || process.env[keyEnv] || process.env.LP_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ""
  );
  const fetchFn = options.fetch || globalThis.fetch;
  if (!hubCode || !courseKey) {
    results.push(checkResult(
      "curriculum.retrieval",
      false,
      "curriculum.hubCode and curriculum.courseKey are required for curriculum probes.",
      "warning"
    ));
    return { results, row: null, retryable: false };
  }
  if (!projectUrl || !publishableKey || typeof fetchFn !== "function") {
    results.push(checkResult(
      "curriculum.retrieval",
      false,
      `Curriculum RPC skipped: set supabaseUrl and ${keyEnv} (publishable key).`,
      "warning"
    ));
    return { results, row: null, retryable: false };
  }
  const body = { p_hub_code: hubCode, p_course_key: courseKey };
  if (curriculum.packageVersion) body.p_package_version = curriculum.packageVersion;
  let response;
  try {
    response = await fetchFn(`${projectUrl}/rest/v1/rpc/published_curriculum_package`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Profile": "api",
        "Accept-Profile": "api",
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "learning-platform-pages-health"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    results.push(checkResult(
      "curriculum.retrieval",
      false,
      `published_curriculum_package request failed: ${error?.message || error}`
    ));
    return { results, row: null, retryable: true };
  }
  if (!response.ok) {
    const text = typeof response.text === "function" ? await response.text() : "";
    const timeout = response.status === 570 || /57014|statement timeout/i.test(text);
    results.push(checkResult(
      "curriculum.retrieval",
      false,
      timeout ? `Curriculum RPC timed out (HTTP ${response.status}). Do not raise anon statement timeout; investigate learner packages / publication.` : `Curriculum RPC failed (HTTP ${response.status}).`
    ));
    return { results, row: null, retryable: !timeout };
  }
  const payload = await response.json();
  const row = firstRow(payload);
  if (!row || !row.package) {
    results.push(checkResult(
      "curriculum.retrieval",
      false,
      `No published curriculum package returned for ${hubCode}/${courseKey}.`
    ));
    return { results, row: null, retryable: false };
  }
  const packageVersion = String(row.package_version || row.package?.version || "");
  results.push(checkResult(
    "curriculum.retrieval",
    true,
    `Published curriculum retrieved for ${hubCode}/${courseKey} (${packageVersion || "unknown version"}).`
  ));
  const expected = curriculum.expectedPackageVersion || (curriculum.expectedPackageVersionEnv ? process.env[curriculum.expectedPackageVersionEnv] : "") || "";
  if (expected) {
    const ok = packageVersion === String(expected);
    results.push(checkResult(
      "curriculum.version",
      ok,
      ok ? `Package version ${packageVersion} matches expected ${expected}.` : `Package version ${packageVersion || "(empty)"} does not match expected ${expected}.`
    ));
  } else {
    results.push(checkResult(
      "curriculum.version",
      Boolean(packageVersion),
      packageVersion ? `Package version ${packageVersion} returned (no expectedPackageVersion pin configured).` : "Package version missing from curriculum RPC response.",
      packageVersion ? "info" : "error"
    ));
  }
  const activityCount = Array.isArray(row.package?.activities) ? row.package.activities.length : 0;
  if (curriculum.minActivityCount != null) {
    const min = Number(curriculum.minActivityCount);
    results.push(checkResult(
      "curriculum.activity-count",
      activityCount >= min,
      activityCount >= min ? `Package includes ${activityCount} activities (min ${min}).` : `Package includes ${activityCount} activities; expected at least ${min} (possible unexpected thin/bundled fallback shape).`
    ));
  }
  return { results, row, retryable: false };
}

// src/deployment-health/browser-probe.js
async function loadPlaywright(options = {}) {
  if (options.playwright) return options.playwright;
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}
async function probeBrowserBoot(config = {}, options = {}) {
  const results = [];
  const kind = String(config.kind || "learner-hub");
  const boot = config.boot || {};
  const requireBrowser = options.requireBrowser === true || boot.require !== false;
  if (kind === "docs-only" || boot.enabled === false) {
    results.push(checkResult(
      "pages.boot",
      true,
      "Browser boot checks skipped for this target.",
      "info"
    ));
    return { results, retryable: false };
  }
  if (options.skipBrowser) {
    results.push(checkResult(
      "pages.boot",
      false,
      "Browser boot checks skipped (--skip-browser).",
      requireBrowser ? "warning" : "info"
    ));
    return { results, retryable: false };
  }
  const playwright = await loadPlaywright(options);
  if (!playwright?.chromium) {
    results.push(checkResult(
      "pages.boot",
      false,
      "Playwright is not installed. Install playwright (and Chromium) to verify boot/white-page/fatal errors.",
      requireBrowser ? "error" : "warning"
    ));
    return { results, retryable: false };
  }
  const baseUrl = ensureTrailingSlash(config.baseUrl);
  const rootSelector = boot.rootSelector || "#root";
  const readySelectors = Array.isArray(boot.readySelectors) && boot.readySelectors.length ? boot.readySelectors : [
    "[data-curriculum-source]",
    "body[data-page]",
    "[data-publication-state]",
    "main",
    "[role='main']"
  ];
  const timeoutMs = Math.max(1e3, Number(boot.readyTimeoutMs) || 3e4);
  const pageErrors = [];
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("pageerror", (error) => {
      pageErrors.push(String(error?.message || error));
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (/favicon|Download the React DevTools/i.test(text)) return;
        pageErrors.push(text);
      }
    });
    const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (!response || !response.ok()) {
      results.push(checkResult(
        "pages.boot",
        false,
        `Browser navigation failed (HTTP ${response?.status() || "n/a"}).`
      ));
      return { results, retryable: true };
    }
    const rootCount = await page.locator(rootSelector).count();
    if (rootCount < 1) {
      results.push(checkResult(
        "pages.boot",
        false,
        `Mount root ${rootSelector} was not found (possible wrong deployment).`
      ));
      return { results, retryable: true };
    }
    let ready = false;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const childCount = await page.locator(`${rootSelector} > *`).count();
      if (childCount > 0) {
        for (const selector of readySelectors) {
          if (await page.locator(selector).count() > 0) {
            ready = true;
            break;
          }
        }
        if (!ready && childCount > 0) {
          ready = true;
        }
      }
      if (ready) break;
      await new Promise((resolve2) => setTimeout(resolve2, 250));
    }
    if (!ready) {
      results.push(checkResult(
        "pages.boot",
        false,
        `White-page regression: ${rootSelector} stayed empty after ${timeoutMs}ms.`
      ));
      return { results, retryable: true };
    }
    results.push(checkResult(
      "pages.boot",
      true,
      "Application mounted content into the root element."
    ));
    const unexpected = pageErrors.filter((message) => {
      const allow = Array.isArray(boot.allowErrorPatterns) ? boot.allowErrorPatterns : [];
      return !allow.some((pattern) => new RegExp(pattern, "i").test(message));
    });
    results.push(checkResult(
      "pages.fatal-errors",
      unexpected.length === 0,
      unexpected.length === 0 ? "No unexpected fatal browser errors observed during boot." : `Unexpected browser errors: ${unexpected.slice(0, 3).join(" | ")}`
    ));
    const curriculum = config.curriculum || {};
    if (curriculum.requirePublishedSource !== false && kind !== "admin-portal") {
      const source = await page.evaluate(() => document.body?.dataset?.curriculumSource || "");
      const publicationState = await page.evaluate(() => document.body?.dataset?.publicationState || "");
      if (!source) {
        results.push(checkResult(
          "curriculum.browser-source",
          false,
          "body[data-curriculum-source] was not set after boot (cannot confirm published vs bundled).",
          "warning"
        ));
      } else if (source === "published" && (!publicationState || publicationState === "PUBLISHED")) {
        results.push(checkResult(
          "curriculum.browser-source",
          true,
          `Browser curriculum source is published (${publicationState || "PUBLISHED"}).`
        ));
      } else {
        results.push(checkResult(
          "curriculum.browser-source",
          false,
          `Unexpected curriculum source "${source}" / state "${publicationState || "n/a"}" (bundled/cache fallback is not healthy for production).`
        ));
      }
    }
    return { results, retryable: false };
  } catch (error) {
    results.push(checkResult(
      "pages.boot",
      false,
      `Browser probe failed: ${error?.message || error}`
    ));
    return { results, retryable: true };
  } finally {
    if (browser) await browser.close().catch(() => {
    });
  }
}

// src/deployment-health/run.js
function defaultRetries(config = {}) {
  const retries = config.retries || {};
  return {
    attempts: Math.max(1, Number(retries.attempts) || 6),
    delayMs: Math.max(0, Number(retries.delayMs) || 1e4)
  };
}
async function runPagesHealthChecks(config = {}, options = {}) {
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
    const report2 = summariseChecks(all);
    return Object.freeze({
      ...report2,
      target: name,
      kind,
      formatted: formatHealthReport(report2, { targetName: name })
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
      shouldRetry: (outcome) => Boolean(outcome?.retryable) && (outcome.results || []).some((item) => !item.passed && isPropagationFailure(item))
    }
  );
  all.push(...staticOutcome.results || []);
  const curriculumOutcome = await withBoundedRetries(
    async () => probePublishedCurriculum(config, options),
    {
      attempts: Math.min(retries.attempts, 4),
      delayMs: retries.delayMs,
      sleep: options.sleep,
      shouldRetry: (outcome) => Boolean(outcome?.retryable)
    }
  );
  all.push(...curriculumOutcome.results || []);
  const browserOutcome = await withBoundedRetries(
    async () => probeBrowserBoot(config, options),
    {
      attempts: Math.min(retries.attempts, 4),
      delayMs: retries.delayMs,
      sleep: options.sleep,
      shouldRetry: (outcome) => Boolean(outcome?.retryable)
    }
  );
  all.push(...browserOutcome.results || []);
  const substantive = all.filter((item) => item.id !== "pages.html");
  const htmlOnlyHealthy = all.some((item) => item.id === "pages.html" && item.passed) && substantive.every((item) => item.passed || item.severity === "info" || item.severity === "warning") && !substantive.some((item) => item.passed && item.severity !== "info" && [
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
async function runPagesHealthFleet(targets = [], options = {}) {
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

// src/deployment-health/load-config.js
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
async function loadPagesHealthConfig(path) {
  const absolute = resolve(path);
  const raw = await readFile(absolute, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.targets)) return parsed.targets;
  if (parsed && typeof parsed === "object") return [parsed];
  throw new Error(`Unsupported pages health config shape in ${absolute}`);
}
export {
  checkPagesDeploymentSource,
  checkResult,
  ensureTrailingSlash,
  extractModuleAssetPaths,
  formatHealthReport,
  htmlReferencesTypeScriptSource,
  isJavascriptMime,
  isPropagationFailure,
  joinUrl,
  loadPagesHealthConfig,
  probeBrowserBoot,
  probePublishedCurriculum,
  probeStaticDeployment,
  runPagesHealthChecks,
  runPagesHealthFleet,
  summariseChecks,
  withBoundedRetries
};
//# sourceMappingURL=deployment-health.esm.js.map
