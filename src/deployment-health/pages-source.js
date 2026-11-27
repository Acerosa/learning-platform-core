import { checkResult } from "./result.js";

/**
 * Verify GitHub Pages is configured for workflow deployment (Actions),
 * not a legacy branch/docs root that would serve README or source trees.
 */
export async function checkPagesDeploymentSource(config = {}, options = {}) {
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
        `GitHub Pages is not enabled for ${repository}.`,
        "error"
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
    const ok = expected === "workflow"
      ? buildType === "workflow"
      : buildType === expected;

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
