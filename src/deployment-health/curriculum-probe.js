import { checkResult } from "./result.js";

function firstRow(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload && typeof payload === "object") return payload;
  return null;
}

export async function probePublishedCurriculum(config = {}, options = {}) {
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
    curriculum.supabaseUrl
    || options.supabaseUrl
    || process.env.LP_SUPABASE_URL
    || process.env.SUPABASE_URL
    || ""
  ).replace(/\/+$/, "");
  const keyEnv = curriculum.publishableKeyEnv || "LP_SUPABASE_PUBLISHABLE_KEY";
  const publishableKey = String(
    options.publishableKey
    || process.env[keyEnv]
    || process.env.LP_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || ""
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
      timeout
        ? `Curriculum RPC timed out (HTTP ${response.status}). Do not raise anon statement timeout; investigate learner packages / publication.`
        : `Curriculum RPC failed (HTTP ${response.status}).`
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

  const expected = curriculum.expectedPackageVersion
    || (curriculum.expectedPackageVersionEnv ? process.env[curriculum.expectedPackageVersionEnv] : "")
    || "";
  if (expected) {
    const ok = packageVersion === String(expected);
    results.push(checkResult(
      "curriculum.version",
      ok,
      ok
        ? `Package version ${packageVersion} matches expected ${expected}.`
        : `Package version ${packageVersion || "(empty)"} does not match expected ${expected}.`
    ));
  } else {
    results.push(checkResult(
      "curriculum.version",
      Boolean(packageVersion),
      packageVersion
        ? `Package version ${packageVersion} returned (no expectedPackageVersion pin configured).`
        : "Package version missing from curriculum RPC response.",
      packageVersion ? "info" : "error"
    ));
  }

  const activityCount = Array.isArray(row.package?.activities) ? row.package.activities.length : 0;
  if (curriculum.minActivityCount != null) {
    const min = Number(curriculum.minActivityCount);
    results.push(checkResult(
      "curriculum.activity-count",
      activityCount >= min,
      activityCount >= min
        ? `Package includes ${activityCount} activities (min ${min}).`
        : `Package includes ${activityCount} activities; expected at least ${min} (possible unexpected thin/bundled fallback shape).`
    ));
  }

  return { results, row, retryable: false };
}
