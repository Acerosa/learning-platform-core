import {
  LEARNER_COPY,
  LEARNER_LABELS,
  PUBLICATION_STATES,
  compareSemver
} from "./constants.js";
import { createCacheManager, curriculumCacheKey } from "./cache-manager.js";
import { createCurriculumValidator } from "./curriculum-validator.js";
import { createPublicationResolver } from "./publication-resolver.js";
import { createRuntimeSchemaLoader } from "./runtime-schema-loader.js";

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

export function resolvePublicationState(local, rows, lookupError, schemaLoader) {
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
  if (
    publication.schemaVersion !== loader.supportedSchemaVersion
    || publication.sourcePackageVersion !== loader.supportedPackageVersion
  ) {
    return publicationResult("INCOMPATIBLE", local, publication);
  }
  return publicationResult("PUBLISHED", local, publication);
}

export function renderPublicationStatus(state) {
  if (!state) return "";
  if (state.state === "PUBLISHED") {
    return `<p class="visually-hidden" role="status" data-publication-state="PUBLISHED">${LEARNER_COPY.PUBLISHED}</p>`;
  }
  const modifier = String(state.state || "ERROR").toLowerCase().replace(/_/g, "-");
  return `<section class="publication-banner publication-banner--${modifier}" role="status" data-publication-state="${state.state}">`
    + `<strong>${LEARNER_LABELS[state.state]}</strong><p>${LEARNER_COPY[state.state]}</p></section>`;
}

export function createPublishedCurriculumService(options = {}) {
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
        const state = publicationResult(
          "FALLBACK",
          localContext(cached.package, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
          mapPublication(cached),
          reason
        );
        return { source: "cache", package: cached.package, state: setState(state), publication: state.publication };
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
        const state = publicationResult(
          "FALLBACK",
          localContext(cached.package, hubCode, courseKey, schemaLoader.supportedSchemaVersion, schemaLoader.supportedPackageVersion),
          mapPublication(cached),
          reason
        );
        return { source: "cache", package: cached.package, state: setState(state), publication: state.publication };
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
      const row = await resolver.fetchPublishedPackage(hubCode, courseKey, packageVersion || undefined);
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
    loadLatest: () => load(undefined),
    loadVersion: (version) => load(version),
    refresh: () => load(undefined),
    invalidate: () => cache.invalidate(hubCode, courseKey),
    getPublicationMetadata: () => current?.publication || null,
    getState: () => current,
    renderStatus: (state) => renderPublicationStatus(state || current),
    allowsSubmission: (state) => Boolean((state || current)?.allowsSubmission),
    submissionMessage: (state) => (state || current)?.message || LEARNER_COPY.ERROR
  });
}

export {
  PUBLICATION_STATES,
  curriculumCacheKey,
  compareSemver,
  createCacheManager,
  createCurriculumValidator,
  createPublicationResolver,
  createRuntimeSchemaLoader
};
