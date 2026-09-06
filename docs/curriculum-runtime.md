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

## Week and session visibility

Published curriculum weeks and sessions expose learner access through
`metadata.status`. The canonical values at both levels are `planned`,
`available` and `archived`.

| Status | Learner access |
| --- | --- |
| `available` | Accessible at that level |
| `planned` | Not accessible |
| `archived` | Not accessible |
| missing / unknown | Not accessible |

A session is learner-accessible only when **both** the parent week and the
session are available:

```text
session accessible
  = week is available
    AND session is available
```

An available session inside a planned or archived week stays closed. Hubs must
not infer access from week number, position, publication version or bundled
configuration. Evaluate each week independently; non-sequential availability is
valid (for example week 1 and week 3 available while week 2 is planned). The
same applies to sessions inside an available week.

```js
import {
  isSessionAccessible,
  isSessionAvailable,
  isWeekAvailable,
  overlayLiveWeekMetadata,
  sessionsFromPublication,
  weeksFromPublication
} from "@learning-platform/core/curriculum-runtime";

const open = isWeekAvailable(week.metadata?.status);
const sessionOpen = isSessionAccessible(week.metadata?.status, session.metadata?.status);
const runtimePackage = overlayLiveWeekMetadata(bundledPackage, livePackage);
const weeks = weeksFromPublication(bundledPackage, livePackage);
const sessions = sessionsFromPublication(bundledPackage, livePackage);
```

`overlayLiveWeekMetadata` (also exported as `overlayLivePackageMetadata`) keeps
bundled week and session structure and learner content while overlaying
authoritative live publication metadata. When a live or cached publication is
present, week `metadata.status` and `metadata.weekCommencing` and session
`metadata.status` win over bundled fallback values. Session relationships,
activities, IDs and versions are not replaced. This supports the existing
resolver order (live publication → cached publication → bundled fallback)
without replacing hub-specific rendering models.

`isSessionAvailable` uses the same conservative semantics as `isWeekAvailable`.
`isSessionAccessible(weekStatus, sessionStatus)` composes both helpers.

The nested package also exports `createCacheManager`, `createPublicationResolver`,
`createCurriculumValidator` and `createRuntimeSchemaLoader` for tests. Hub
application code should use `createPublishedCurriculumService` or
`platform.curriculum`.
