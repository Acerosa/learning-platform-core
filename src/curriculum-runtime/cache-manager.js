import { CURRICULUM_CACHE_PREFIX } from "./constants.js";

function identityKey(hubCode, courseKey) {
  return `${CURRICULUM_CACHE_PREFIX}:${String(hubCode || "")}:${String(courseKey || "")}`;
}

export function curriculumCacheKey(hubCode, courseKey, publicationVersion = "latest") {
  const base = identityKey(hubCode, courseKey);
  if (!publicationVersion || publicationVersion === "latest") return base;
  return `${base}:v:${publicationVersion}`;
}

export function createCacheManager(storage) {
  function read(hubCode, courseKey, publicationVersion = "latest") {
    if (!storage || typeof storage.getItem !== "function" || !hubCode || !courseKey) return null;
    const keys = [curriculumCacheKey(hubCode, courseKey, publicationVersion)];
    if (publicationVersion && publicationVersion !== "latest") {
      keys.push(curriculumCacheKey(hubCode, courseKey, "latest"));
    }
    for (const key of keys) {
      try {
        const parsed = JSON.parse(storage.getItem(key) || "null");
        if (!parsed || !parsed.package) continue;
        const cachedHub = parsed.hubCode || parsed.hubId;
        if (cachedHub !== hubCode || parsed.courseKey !== courseKey) continue;
        if (publicationVersion && publicationVersion !== "latest" && parsed.packageVersion !== publicationVersion) {
          continue;
        }
        return parsed;
      } catch {
        continue;
      }
    }
    return null;
  }

  function write(hubCode, courseKey, row, pkg, publicationVersion = "latest") {
    if (!storage || typeof storage.setItem !== "function" || !hubCode || !courseKey || !pkg) return false;
    const slot = publicationVersion || "latest";
    const record = {
      hubCode,
      hubId: hubCode,
      courseKey,
      packageVersion: row?.package_version || row?.packageVersion || pkg.version,
      schemaVersion: row?.schema_version || row?.schemaVersion,
      sourcePackageVersion: row?.source_package_version || row?.sourcePackageVersion,
      contentHash: row?.content_hash || row?.contentHash || "",
      publishedAt: row?.published_at || row?.publishedAt,
      cachedAt: new Date().toISOString(),
      package: pkg
    };
    try {
      const key = curriculumCacheKey(hubCode, courseKey, slot);
      storage.setItem(key, JSON.stringify(record));
      const indexKey = `${identityKey(hubCode, courseKey)}:slots`;
      const slots = JSON.parse(storage.getItem(indexKey) || "[]");
      if (!slots.includes(key)) slots.push(key);
      storage.setItem(indexKey, JSON.stringify(slots));
      return true;
    } catch {
      return false;
    }
  }

  function invalidate(hubCode, courseKey) {
    if (!storage) return false;
    const prefix = identityKey(hubCode, courseKey);
    const indexKey = `${prefix}:slots`;
    let keys = [prefix, indexKey];
    try {
      keys = keys.concat(JSON.parse(storage.getItem(indexKey) || "[]"));
    } catch {
      keys = [prefix, indexKey];
    }
    if (typeof storage.key === "function" && Number.isFinite(storage.length)) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && (key === prefix || key.startsWith(`${prefix}:`))) keys.push(key);
      }
    }
    [...new Set(keys)].forEach((key) => storage.removeItem?.(key));
    return true;
  }

  return Object.freeze({ read, write, invalidate, key: curriculumCacheKey });
}
