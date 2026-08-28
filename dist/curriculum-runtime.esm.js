// src/curriculum-runtime/constants.js
var CURRICULUM_CACHE_PREFIX = "lp.curriculum.cache.v1";
var SUPPORTED_SCHEMA_VERSION = "0.1.0";
var SUPPORTED_PACKAGE_VERSION = "0.1.0";
var PUBLICATION_STATES = Object.freeze([
  "PUBLISHED",
  "FALLBACK",
  "NO_PUBLICATION",
  "INCOMPATIBLE",
  "ERROR"
]);
var LEARNER_COPY = Object.freeze({
  PUBLISHED: "This teaching copy is the official published course version.",
  FALLBACK: "This page is showing the saved teaching copy because the live course version could not be loaded. You can still read and practise. Progress will not be saved to your learning record until the live version is available.",
  NO_PUBLICATION: "This course version is not officially published yet. You can still read and practise. Progress will not be saved to your learning record yet.",
  INCOMPATIBLE: "This teaching copy cannot be used as the live course version. You can still read the saved copy. Progress cannot be saved to your learning record.",
  ERROR: "The live course version could not be confirmed. You can still read the saved teaching copy. Saving progress is temporarily unavailable."
});
var LEARNER_LABELS = Object.freeze({
  PUBLISHED: "Current",
  FALLBACK: "Saved copy",
  NO_PUBLICATION: "Preview",
  INCOMPATIBLE: "Unavailable to save",
  ERROR: "Temporarily unable to save progress"
});
function compareSemver(left, right) {
  const a = String(left || "0.0.0").split(".").map((part) => Number(part) || 0);
  const b = String(right || "0.0.0").split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
}
function firstRow(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload && typeof payload === "object") return payload;
  return null;
}

// src/curriculum-runtime/cache-manager.js
function identityKey(hubCode, courseKey) {
  return `${CURRICULUM_CACHE_PREFIX}:${String(hubCode || "")}:${String(courseKey || "")}`;
}
function curriculumCacheKey(hubCode, courseKey, publicationVersion = "latest") {
  const base = identityKey(hubCode, courseKey);
  if (!publicationVersion || publicationVersion === "latest") return base;
  return `${base}:v:${publicationVersion}`;
}
function createCacheManager(storage) {
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
      cachedAt: (/* @__PURE__ */ new Date()).toISOString(),
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

// src/curriculum-runtime/curriculum-validator.js
function createCurriculumValidator({ validatePackage } = {}) {
  function validate(pkg) {
    if (!pkg || typeof pkg !== "object") {
      return { valid: false, issues: [{ code: "INVALID_PUBLICATION", path: "package", message: "published package is missing" }] };
    }
    if (typeof validatePackage === "function") {
      const result = validatePackage(pkg);
      if (result && result.valid === false) return result;
      if (result && result.valid === true) return result;
    }
    if (!pkg.hub || !pkg.curriculum) {
      return { valid: false, issues: [{ code: "INVALID_PUBLICATION", path: "package", message: "hub and curriculum are required" }] };
    }
    return { valid: true, issues: [] };
  }
  return Object.freeze({ validate });
}

// src/curriculum-runtime/publication-resolver.js
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
function createPublicationResolver({
  api,
  fetchFn,
  projectUrl,
  publishableKey,
  getAccessToken
} = {}) {
  async function fetchPublishedPackage(hubCode, courseKey, packageVersion) {
    if (typeof api?.getPublishedCurriculumPackage === "function") {
      const payload = await api.getPublishedCurriculumPackage(hubCode, courseKey, packageVersion);
      const row2 = firstRow(payload);
      if (!row2 || !row2.package) throw new Error("publication-lookup-empty");
      return row2;
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

// src/curriculum-runtime/runtime-schema-loader.js
function createRuntimeSchemaLoader({
  supportedSchemaVersion = SUPPORTED_SCHEMA_VERSION,
  supportedPackageVersion = SUPPORTED_PACKAGE_VERSION
} = {}) {
  function inspect(row, pkg = row?.package) {
    const schemaVersion = row?.schema_version || row?.schemaVersion || pkg?.schemaVersion || "";
    const packageVersion = row?.source_package_version || row?.sourcePackageVersion || pkg?.schemaVersion || "";
    return Object.freeze({
      schemaVersion,
      packageVersion,
      supportedSchemaVersion,
      supportedPackageVersion,
      compatible: (!schemaVersion || schemaVersion === supportedSchemaVersion) && (!packageVersion || packageVersion === supportedPackageVersion)
    });
  }
  return Object.freeze({ inspect, supportedSchemaVersion, supportedPackageVersion });
}

// src/curriculum-runtime/published-curriculum-service.js
function mapPublication(row) {
  if (!row) return null;
  return Object.freeze({
    hub: row.hub_code || row.hubCode,
    course: row.course_key || row.courseKey,
    hubCode: row.hub_code || row.hubCode,
    courseKey: row.course_key || row.courseKey,
    version: row.package_version || row.packageVersion,
    packageVersion: row.package_version || row.packageVersion,
    schemaVersion: row.schema_version || row.schemaVersion,
    sourcePackageVersion: row.source_package_version || row.sourcePackageVersion,
    publishedAt: row.published_at || row.publishedAt,
    contentHash: row.content_hash || row.contentHash || "",
    status: row.status || "published"
  });
}
function localContext(pkg, hubCode, courseKey, schemaVersion, contentPackageVersion) {
  const curriculum = pkg?.curriculum;
  const indexVersion = pkg?.indexFile?.version || pkg?.version;
  return Object.freeze({
    hubCode: hubCode || pkg?.hub?.id || "",
    courseKey: courseKey || curriculum?.metadata?.course || "",
    packageVersion: pkg?.version || indexVersion || curriculum?.version || "",
    schemaVersion: pkg?.schemaVersion || schemaVersion || curriculum?.schemaVersion || "",
    contentPackageVersion: contentPackageVersion || ""
  });
}
function publicationResult(state, local, publication, reason) {
  return Object.freeze({
    state,
    source: state === "PUBLISHED" ? "published" : "fallback",
    label: LEARNER_LABELS[state],
    message: LEARNER_COPY[state],
    allowsSubmission: state === "PUBLISHED",
    local: local || null,
    publication: publication || null,
    reason: reason || null
  });
}
function resolvePublicationState(local, rows, lookupError, schemaLoader) {
  const loader = schemaLoader || createRuntimeSchemaLoader();
  if (lookupError) return publicationResult("ERROR", local, null);
  if (!local?.hubCode || !local?.courseKey) return publicationResult("ERROR", local, null);
  if (local.schemaVersion && local.schemaVersion !== loader.supportedSchemaVersion) {
    return publicationResult("INCOMPATIBLE", local, null);
  }
  if (local.contentPackageVersion && local.contentPackageVersion !== loader.supportedPackageVersion) {
    return publicationResult("INCOMPATIBLE", local, null);
  }
  const row = Array.isArray(rows) ? rows[0] : rows;
  const publication = mapPublication(row);
  if (!publication) return publicationResult("NO_PUBLICATION", local, null);
  if (publication.schemaVersion !== loader.supportedSchemaVersion || publication.sourcePackageVersion !== loader.supportedPackageVersion) {
    return publicationResult("INCOMPATIBLE", local, publication);
  }
  return publicationResult("PUBLISHED", local, publication);
}
function renderPublicationStatus(state) {
  if (!state) return "";
  if (state.state === "PUBLISHED") {
    return `<p class="visually-hidden" role="status" data-publication-state="PUBLISHED">${LEARNER_COPY.PUBLISHED}</p>`;
  }
  const modifier = String(state.state || "ERROR").toLowerCase().replace(/_/g, "-");
  return `<section class="publication-banner publication-banner--${modifier}" role="status" data-publication-state="${state.state}"><strong>${LEARNER_LABELS[state.state]}</strong><p>${LEARNER_COPY[state.state]}</p></section>`;
}
function createPublishedCurriculumService(options = {}) {
  const hubCode = String(options.hubCode || "").trim();
  const courseKey = String(options.courseKey || "").trim();
  const schemaLoader = options.schemaLoader || createRuntimeSchemaLoader({
    supportedSchemaVersion: options.supportedSchemaVersion,
    supportedPackageVersion: options.supportedPackageVersion
  });
  const validator = options.validator || createCurriculumValidator({
    validatePackage: options.validatePackage
  });
  const cache = options.cache || createCacheManager(options.storage);
  const resolver = options.resolver || createPublicationResolver({
    api: options.api,
    fetchFn: options.fetch || globalThis.fetch,
    projectUrl: options.projectUrl || options.supabase?.projectUrl || options.config?.projectUrl,
    publishableKey: options.publishableKey || options.supabase?.publishableKey || options.config?.publishableKey,
    getAccessToken: options.getAccessToken || (() => options.session?.access_token)
  });
  let current = null;
  function setState(state) {
    current = state || null;
    return current;
  }
  async function fallback(reason, packageVersion) {
    const loadBundled = options.loadBundled;
    if (typeof loadBundled !== "function") {
      const cached = cache.read(hubCode, courseKey, packageVersion || "latest");
      if (cached?.package && validator.validate(cached.package).valid) {
        const state2 = publicationResult(
          "FALLBACK",
          localContext(cached.package, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
          mapPublication(cached),
          reason
        );
        return { source: "cache", package: cached.package, state: setState(state2), publication: state2.publication };
      }
      const empty = setState(publicationResult(
        reason === "incompatible" ? "INCOMPATIBLE" : reason === "invalid-package" ? "ERROR" : "NO_PUBLICATION",
        localContext(null, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
        null,
        reason
      ));
      return { source: "none", package: null, state: empty, publication: null };
    }
    const pkg = await loadBundled();
    const validation = validator.validate(pkg);
    if (!validation.valid) {
      const cached = cache.read(hubCode, courseKey, packageVersion || "latest");
      if (cached?.package && validator.validate(cached.package).valid) {
        const state2 = publicationResult(
          "FALLBACK",
          localContext(cached.package, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
          mapPublication(cached),
          reason
        );
        return { source: "cache", package: cached.package, state: setState(state2), publication: state2.publication };
      }
      throw new Error("bundled-package-invalid");
    }
    const state = publicationResult(
      "FALLBACK",
      localContext(pkg, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
      null,
      reason
    );
    return { source: "bundled", package: pkg, state: setState(state), publication: null };
  }
  async function load(packageVersion) {
    try {
      const row = await resolver.fetchPublishedPackage(hubCode, courseKey, packageVersion || void 0);
      const pkg = resolver.hydrate(row);
      if (!validator.validate(pkg).valid) return fallback("invalid-package", packageVersion);
      const schema = schemaLoader.inspect(row, pkg);
      if (!schema.compatible) return fallback("incompatible", packageVersion);
      cache.write(hubCode, courseKey, row, pkg, packageVersion || "latest");
      const state = publicationResult(
        "PUBLISHED",
        localContext(pkg, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
        mapPublication(row)
      );
      return { source: "published", package: pkg, state: setState(state), publication: state.publication };
    } catch {
      const cached = cache.read(hubCode, courseKey, packageVersion || "latest");
      if (cached?.package && validator.validate(cached.package).valid) {
        const state = publicationResult(
          "FALLBACK",
          localContext(cached.package, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
          mapPublication(cached),
          "unavailable"
        );
        return { source: "cache", package: cached.package, state: setState(state), publication: state.publication };
      }
      return fallback("unavailable", packageVersion);
    }
  }
  return Object.freeze({
    hubCode,
    courseKey,
    loadLatest: () => load(void 0),
    loadVersion: (version) => load(version),
    refresh: () => load(void 0),
    invalidate: () => cache.invalidate(hubCode, courseKey),
    getPublicationMetadata: () => current?.publication || null,
    getState: () => current,
    renderStatus: (state) => renderPublicationStatus(state || current),
    allowsSubmission: (state) => Boolean((state || current)?.allowsSubmission),
    submissionMessage: (state) => (state || current)?.message || LEARNER_COPY.ERROR
  });
}

// src/curriculum-runtime/week-visibility.js
function isWeekAvailable(status) {
  return String(status ?? "").trim().toLowerCase() === "available";
}
function teachingWeekNumber(week) {
  const n = Number(week?.metadata?.teachingWeek);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function overlayLiveWeekMetadata(base, live) {
  if (!base || typeof base !== "object") return base;
  if (!live?.weeks?.length) return base;
  const liveById = /* @__PURE__ */ new Map();
  const liveByTeachingWeek = /* @__PURE__ */ new Map();
  for (const week of live.weeks) {
    if (week?.id) liveById.set(week.id, week.metadata);
    const n = teachingWeekNumber(week);
    if (n != null && !liveByTeachingWeek.has(n)) liveByTeachingWeek.set(n, week.metadata);
  }
  return {
    ...base,
    weeks: (base.weeks || []).map((week) => {
      const n = teachingWeekNumber(week);
      const liveMeta = (week?.id ? liveById.get(week.id) : void 0) || (n != null ? liveByTeachingWeek.get(n) : void 0);
      if (!liveMeta) return week;
      const liveStatus = liveMeta.status == null ? "" : String(liveMeta.status).trim();
      return {
        ...week,
        metadata: {
          ...week.metadata,
          status: liveStatus || week.metadata?.status,
          weekCommencing: liveMeta.weekCommencing ?? week.metadata?.weekCommencing
        }
      };
    })
  };
}
function weeksFromPublication(basePackage, livePackage) {
  const pkg = livePackage?.weeks?.length ? overlayLiveWeekMetadata(basePackage, livePackage) : basePackage;
  if (!pkg?.weeks?.length) return [];
  return [...pkg.weeks].map((week) => {
    const teachingWeek = Number(week.metadata?.teachingWeek || 0);
    const status = String(week.metadata?.status ?? "").trim();
    return {
      id: week.id,
      teachingWeek,
      status,
      available: isWeekAvailable(status),
      title: week.metadata?.title || (teachingWeek ? `Week ${teachingWeek}` : week.id)
    };
  }).filter((week) => week.id && week.teachingWeek > 0).sort((left, right) => left.teachingWeek - right.teachingWeek);
}
export {
  CURRICULUM_CACHE_PREFIX,
  LEARNER_COPY,
  LEARNER_LABELS,
  PUBLICATION_STATES,
  SUPPORTED_PACKAGE_VERSION,
  SUPPORTED_SCHEMA_VERSION,
  compareSemver,
  createCacheManager,
  createCurriculumValidator,
  createPublicationResolver,
  createPublishedCurriculumService,
  createRuntimeSchemaLoader,
  curriculumCacheKey,
  isWeekAvailable,
  overlayLiveWeekMetadata,
  renderPublicationStatus,
  resolvePublicationState,
  weeksFromPublication
};
//# sourceMappingURL=curriculum-runtime.esm.js.map
