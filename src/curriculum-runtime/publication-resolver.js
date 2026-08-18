import { firstRow } from "./constants.js";

function hydrate(row) {
  const pkg = row && row.package;
  if (!pkg || typeof pkg !== "object") {
    throw new Error("published-package-invalid");
  }
  pkg.version = row.package_version || pkg.version;
  pkg.schemaVersion = row.source_package_version || pkg.schemaVersion;
  pkg.id = pkg.id || pkg.hub?.id || "";
  pkg.indexFile = pkg.indexFile || {
    schema: "lp.content.package",
    schemaVersion: pkg.schemaVersion,
    id: pkg.id,
    version: pkg.version
  };
  return pkg;
}

export function createPublicationResolver({
  api,
  fetchFn,
  projectUrl,
  publishableKey,
  getAccessToken
} = {}) {
  async function fetchPublishedPackage(hubCode, courseKey, packageVersion) {
    if (typeof api?.getPublishedCurriculumPackage === "function") {
      const payload = await api.getPublishedCurriculumPackage(hubCode, courseKey, packageVersion);
      const row = firstRow(payload);
      if (!row || !row.package) throw new Error("publication-lookup-empty");
      return row;
    }

    const url = String(projectUrl || "").replace(/\/+$/, "");
    const key = publishableKey || "";
    const token = (typeof getAccessToken === "function" ? getAccessToken() : null) || key;
    if (typeof fetchFn !== "function" || !url || !key || !hubCode || !courseKey) {
      throw new Error("publication-lookup-unavailable");
    }

    const body = { p_hub_code: hubCode, p_course_key: courseKey };
    if (packageVersion) body.p_package_version = packageVersion;

    const response = await fetchFn(`${url}/rest/v1/rpc/published_curriculum_package`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Profile": "api",
        "Accept-Profile": "api",
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response?.ok) throw new Error("publication-lookup-failed");
    const row = firstRow(await response.json());
    if (!row || !row.package) throw new Error("publication-lookup-empty");
    return row;
  }

  return Object.freeze({ fetchPublishedPackage, hydrate });
}
