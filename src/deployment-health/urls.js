export function ensureTrailingSlash(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value : `${value}/`;
}

export function joinUrl(baseUrl, relativePath) {
  const base = ensureTrailingSlash(baseUrl);
  const path = String(relativePath || "").replace(/^\.\//, "").replace(/^\/+/, "");
  return new URL(path, base).toString();
}

export function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export function extractModuleAssetPaths(html) {
  const source = String(html || "");
  const paths = [];
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = scriptRe.exec(source))) {
    const tag = match[0];
    const src = match[1];
    if (/\btype=["']module["']/i.test(tag) || /\.js(?:\?|$)/i.test(src)) {
      paths.push(src);
    }
  }
  return paths;
}

export function htmlReferencesTypeScriptSource(html) {
  const source = String(html || "");
  return /(?:src|href)=["'][^"']+\.(?:tsx|ts|jsx)(?:\?[^"']*)?["']/i.test(source)
    || /src\/main\.(?:tsx|ts|jsx)/i.test(source);
}

export function isJavascriptMime(contentType) {
  const value = String(contentType || "").toLowerCase();
  return (
    value.includes("javascript")
    || value.includes("ecmascript")
    || value === "text/js"
  );
}

export function looksLikeHtmlBody(body) {
  const sample = String(body || "").slice(0, 200).toLowerCase();
  return sample.includes("<!doctype html") || sample.includes("<html");
}
