import { checkResult } from "./result.js";
import { ensureTrailingSlash } from "./urls.js";

async function loadPlaywright(options = {}) {
  if (options.playwright) return options.playwright;
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

/**
 * Browser boot / white-page / fatal-error probe. Requires Playwright when enabled.
 * Public checks only — no learner credentials.
 */
export async function probeBrowserBoot(config = {}, options = {}) {
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
  const readySelectors = Array.isArray(boot.readySelectors) && boot.readySelectors.length
    ? boot.readySelectors
    : [
      "[data-curriculum-source]",
      "body[data-page]",
      "[data-publication-state]",
      "main",
      "[role='main']"
    ];
  const timeoutMs = Math.max(1000, Number(boot.readyTimeoutMs) || 30000);
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
          // Hub shells often render into #root before dataset markers appear.
          ready = true;
        }
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
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
      unexpected.length === 0
        ? "No unexpected fatal browser errors observed during boot."
        : `Unexpected browser errors: ${unexpected.slice(0, 3).join(" | ")}`
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
    if (browser) await browser.close().catch(() => {});
  }
}
