import { checkResult } from "./result.js";
import {
  extractModuleAssetPaths,
  htmlReferencesTypeScriptSource,
  isJavascriptMime,
  joinUrl,
  looksLikeHtmlBody,
  pathnameOf
} from "./urls.js";

async function readResponse(response) {
  const contentType = response.headers?.get?.("content-type") || response.headers?.get?.("Content-Type") || "";
  const text = typeof response.text === "function" ? await response.text() : "";
  return { contentType, text, status: response.status, ok: response.ok };
}

export async function probeStaticDeployment(config = {}, options = {}) {
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
    const pathOk = normalisedActual === normalisedExpected
      || normalisedActual.endsWith(normalisedExpected)
      || normalisedExpected.endsWith(normalisedActual);
    results.push(checkResult(
      "pages.base-path",
      pathOk,
      pathOk
        ? `Deployment path ${normalisedActual} matches expected base path.`
        : `Deployment path ${normalisedActual} does not match expected base path ${normalisedExpected}.`
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

    const mimeOk = isJavascriptMime(assetPayload.contentType)
      && !looksLikeHtmlBody(assetPayload.text);
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
