# Curriculum runtime

`@learning-platform/core/curriculum-runtime` is the shared learner runtime for
published teaching packages. Learner hubs do not implement publication lookup,
cache keys, schema gates or fallback policy.

## PublishedCurriculumService

Create a service with hub identity only:

```js
import { createPublishedCurriculumService } from "@learning-platform/core/curriculum-runtime";

const curriculum = createPublishedCurriculumService({
  hubCode,
  courseKey,
  api,            // learner-safe adapter, or
  fetch,          // REST fallback for static IIFE hubs
  supabase: { projectUrl, publishableKey },
  storage: localStorage,
  validatePackage, // from @learning-platform/content when available
  loadBundled      // optional Git snapshot used only as fallback
});

await curriculum.loadLatest();
await curriculum.loadVersion("0.2.1");
await curriculum.refresh();
curriculum.invalidate();
curriculum.getPublicationMetadata();
```

`createPlatform({ hubCode, hubName, courseKey, ... })` attaches the same
service as `platform.curriculum`. Hubs should ask that façade for curriculum
and must not call `api.published_curriculum_package` themselves.

## Runtime flow

```text
Application starts
        ↓
PublishedCurriculumService.loadLatest(hubCode, courseKey)
        ↓
PublicationResolver → api.published_curriculum_package
        ↓
RuntimeSchemaLoader (schema 0.1.0 / package 0.1.0)
        ↓
CurriculumValidator (injected Content validatePackage when present)
        ↓
CacheManager write
        ↓
Hub renders the returned package
```

Optional `loadVersion` uses the same path with `p_package_version`. Latest
loads omit that argument so the existing two-argument RPC remains valid.

## Cache behaviour

Keys are hub- and course-scoped:

```text
lp.curriculum.cache.v1:{hubCode}:{courseKey}           # latest
lp.curriculum.cache.v1:{hubCode}:{courseKey}:v:{ver}   # explicit version
```

A successful live load overwrites that slot. `invalidate()` removes every slot
for that hub and course. Corrupted JSON is ignored. Cache from another hub is
never reused.

## Error handling

| Condition | Result |
| --- | --- |
| No live publication | bundled snapshot if provided, else `NO_PUBLICATION` |
| Invalid package | bundled or cache fallback, `FALLBACK` / `ERROR` |
| Unsupported schema | bundled or cache fallback, `INCOMPATIBLE` when nothing valid remains |
| Lookup failure / offline | valid cache, then bundled snapshot |
| Corrupted cache | treated as missing |

Authoritative submissions remain allowed only when the resolved state is
`PUBLISHED`.

## Publication metadata

`getPublicationMetadata()` exposes `version`, `publishedAt`, `hub`, `course`,
`schemaVersion`, `contentHash` and `status` for diagnostics. Hubs must not
surface hashes, RPC names or RLS details to learners.

## Responsibilities

| Platform (this package + backend) | Learner hub |
| --- | --- |
| Resolve, validate, cache and select publication versions | Supply `hubCode`, `courseKey`, theme and branding |
| Call `api.published_curriculum_package` | Render hub-specific chrome |
| Shared learner-safe fallback copy | Optional bundled snapshot and Content `validatePackage` |

A future hub should only need configuration equivalent to
`createHub({ hubCode, courseKey, theme })`. Publication loading is automatic
once `courseKey` is set on `createPlatform`.

The nested package also exports `createCacheManager`, `createPublicationResolver`,
`createCurriculumValidator` and `createRuntimeSchemaLoader` for tests. Hub
application code should use `createPublishedCurriculumService` or
`platform.curriculum`.
