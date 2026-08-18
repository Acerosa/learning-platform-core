import test from "node:test";
import assert from "node:assert/strict";
import {
  createCacheManager,
  createPublishedCurriculumService,
  curriculumCacheKey,
  resolvePublicationState,
  CURRICULUM_CACHE_PREFIX
} from "../../src/curriculum-runtime/index.js";
import { memoryStorage } from "../helpers.js";

function pkg(hubCode, courseKey, version = "0.2.0") {
  return {
    schema: "lp.content.package",
    schemaVersion: "0.1.0",
    id: `${hubCode}-content`,
    version,
    hub: { id: hubCode },
    curriculum: { metadata: { course: courseKey } }
  };
}

function row(hubCode, courseKey, overrides = {}) {
  return {
    hub_code: hubCode,
    course_key: courseKey,
    package_version: "0.2.0",
    schema_version: "0.1.0",
    source_package_version: "0.1.0",
    published_at: "2026-08-17T12:00:00Z",
    content_hash: "hash-1",
    package: pkg(hubCode, courseKey),
    ...overrides
  };
}

function serviceFor(hubCode, courseKey, { rows, error, storage, validatePackage, loadBundled } = {}) {
  return createPublishedCurriculumService({
    hubCode,
    courseKey,
    storage: storage || memoryStorage(),
    validatePackage,
    loadBundled,
    api: {
      getPublishedCurriculumPackage: async (_hub, _course, version) => {
        if (error) throw error;
        if (typeof rows === "function") return rows(version);
        return rows;
      }
    }
  });
}

test("latest publication loading is scoped by hub and course", async () => {
  const storage = memoryStorage();
  const first = serviceFor("hub-alpha", "course-one", {
    storage,
    rows: [row("hub-alpha", "course-one")]
  });
  const second = serviceFor("hub-beta", "course-two", {
    storage,
    rows: [row("hub-beta", "course-two", { package_version: "0.3.0", package: pkg("hub-beta", "course-two", "0.3.0") })]
  });
  const a = await first.loadLatest();
  const b = await second.loadLatest();
  assert.equal(a.source, "published");
  assert.equal(b.package.version, "0.3.0");
  assert.equal(
    curriculumCacheKey("hub-alpha", "course-one"),
    `${CURRICULUM_CACHE_PREFIX}:hub-alpha:course-one`
  );
  assert.notEqual(
    curriculumCacheKey("hub-alpha", "course-one"),
    curriculumCacheKey("hub-beta", "course-two")
  );
  assert.equal(JSON.parse(storage.getItem(curriculumCacheKey("hub-alpha", "course-one"))).package.version, "0.2.0");
  assert.equal(JSON.parse(storage.getItem(curriculumCacheKey("hub-beta", "course-two"))).package.version, "0.3.0");
});

test("explicit version loading requests that publication version", async () => {
  const calls = [];
  const service = createPublishedCurriculumService({
    hubCode: "hub-alpha",
    courseKey: "course-one",
    storage: memoryStorage(),
    api: {
      getPublishedCurriculumPackage: async (hub, course, version) => {
        calls.push({ hub, course, version });
        return [row(hub, course, {
          package_version: version,
          package: pkg(hub, course, version)
        })];
      }
    }
  });
  const loaded = await service.loadVersion("0.1.0");
  assert.deepEqual(calls, [{ hub: "hub-alpha", course: "course-one", version: "0.1.0" }]);
  assert.equal(loaded.publication.version, "0.1.0");
  assert.equal(service.getPublicationMetadata().version, "0.1.0");
  assert.equal(service.getPublicationMetadata().hub, "hub-alpha");
  assert.equal(service.getPublicationMetadata().course, "course-one");
  assert.equal(service.getPublicationMetadata().schemaVersion, "0.1.0");
});

test("cache refresh overwrites the latest slot and invalidate clears hub course keys", async () => {
  const storage = memoryStorage();
  let version = "0.2.0";
  const service = serviceFor("hub-alpha", "course-one", {
    storage,
    rows: () => [row("hub-alpha", "course-one", {
      package_version: version,
      package: pkg("hub-alpha", "course-one", version)
    })]
  });
  await service.loadLatest();
  version = "0.2.1";
  const refreshed = await service.refresh();
  assert.equal(refreshed.package.version, "0.2.1");
  assert.equal(JSON.parse(storage.getItem(curriculumCacheKey("hub-alpha", "course-one"))).packageVersion, "0.2.1");
  service.invalidate();
  assert.equal(storage.getItem(curriculumCacheKey("hub-alpha", "course-one")), null);
});

test("invalid publications and unsupported schemas fall back without mixing hubs", async () => {
  const bundled = pkg("hub-alpha", "course-one", "0.1.9");
  const invalid = await serviceFor("hub-alpha", "course-one", {
    rows: [row("hub-alpha", "course-one", { package: { not: "a package" } })],
    validatePackage: (candidate) => ({ valid: Boolean(candidate?.hub && candidate?.curriculum) }),
    loadBundled: () => bundled
  }).loadLatest();
  assert.equal(invalid.source, "bundled");
  assert.equal(invalid.state.state, "FALLBACK");

  const unsupported = await serviceFor("hub-beta", "course-two", {
    rows: [row("hub-beta", "course-two", { schema_version: "9.9.9" })],
    loadBundled: () => pkg("hub-beta", "course-two")
  }).loadLatest();
  assert.equal(unsupported.source, "bundled");
  assert.equal(unsupported.state.reason, "incompatible");
});

test("offline mode uses a valid cache and ignores corrupted cache entries", async () => {
  const storage = memoryStorage();
  const cache = createCacheManager(storage);
  cache.write("hub-alpha", "course-one", row("hub-alpha", "course-one"), pkg("hub-alpha", "course-one"));
  storage.setItem(curriculumCacheKey("hub-beta", "course-two"), "{not-json");
  const offline = await serviceFor("hub-alpha", "course-one", {
    storage,
    error: new Error("offline")
  }).loadLatest();
  assert.equal(offline.source, "cache");
  assert.equal(offline.state.state, "FALLBACK");
  const corrupt = await serviceFor("hub-beta", "course-two", {
    storage,
    error: new Error("offline")
  }).loadLatest();
  assert.equal(corrupt.source, "none");
  assert.equal(corrupt.state.state, "NO_PUBLICATION");
});

test("resolvePublicationState remains hub-agnostic", () => {
  const local = {
    hubCode: "hub-alpha",
    courseKey: "course-one",
    schemaVersion: "0.1.0",
    contentPackageVersion: "0.1.0"
  };
  assert.equal(resolvePublicationState(local, [row("hub-alpha", "course-one")]).state, "PUBLISHED");
  assert.equal(resolvePublicationState(local, []).state, "NO_PUBLICATION");
  assert.equal(resolvePublicationState(local, [row("hub-alpha", "course-one", { schema_version: "2.0.0" })]).state, "INCOMPATIBLE");
  assert.equal(resolvePublicationState(local, [], true).state, "ERROR");
});
