# NHC Learning Platform — Supabase request-volume audit

**Status:** Stage 1 audit complete. Phase 1 and Phase 2 remediation applied 2026-09-21. Phase 3 release + validation + measurement applied 2026-09-21. Do not start Phase 4 until production measurements exist.  
**Date:** 2026-09-21  
**Reported volume:** approximately 9.4 million requests/month on the RR NHC Hub Supabase project  
**Scope:** learner hubs, Central Admin Portal, shared Core client, shared backend. No schema, RLS, RPC contract, scoring, or progress-recording changes were made.

This audit is based on source code across the platform repositories. It does **not** use live Supabase logs. The highest-confidence next step after review is to confirm the top RPC / Auth / Realtime paths in the project’s API reports, then implement the phased plan below.

---

## 1. Executive summary

The 9.4 million monthly requests are **not explained by a single forgotten 5-second poller**. There is almost no learner-facing timer that repeatedly hits Supabase while a page sits idle.

They **are** explained by the combination of:

1. **Draft persistence as a near-continuous write stream** (`api.save_activity_state`). Text input is saved on every `input` event with a **600ms debounce**. Unit 3 host worksheets bypass that debounce (`immediate: true`) and often write **two activity keys at once**.
2. **Heavy bootstrap on every hub open / token refresh.** A signed-in learner start typically issues Auth `getUser()`, `ensure_learner_auth_link`, `my_profile`, `my_enrolments`, `resolve_learner_hub_access`, `my_hub_assignments`, and `published_curriculum_package`. Auth `TOKEN_REFRESHED` re-runs the learner refresh path because Core treats any session event as a full authenticated transition.
3. **Week-open fan-out.** Opening a week hydrates **every activity on that week** (`get_activity_state` × N). Unit 3 also hydrates week 2–7 “carrier” drafts on pages that load `backend-progress.js`.
4. **A persistent Realtime subscription per signed-in learner** (`learner-state:{userId}`), started as soon as Auth is authenticated. If Supabase’s 9.4M figure includes Realtime frames, heartbeats alone can be millions per month. A revision-aware broadcast migration exists locally but is **not committed**.
5. **Admin traffic is bursty, not continuous**, except the Group Generator poller (2.5s). Admin cannot independently explain 9.4M unless many staff leave that tool open. Opening Analytics / Results still issues many overlapping reads, some paginated at 1,000 rows.

Under realistic teaching-hour assumptions (not 180 permanently concurrent learners), **draft saves + bootstrap duplication + week hydrates** can reach several million REST requests per month. **Realtime heartbeats** can add a similar amount *if they are counted as “requests”*.

**Do not reduce write volume in a way that risks losing learner drafts.** The first safe cuts are: stop repeating bootstrap on token refresh, stop hydrating an entire week up front, stop writing two carrier rows for one local edit, and confirm whether Realtime is in the 9.4M number.

---

## 2. Supabase usage inventory

Repos searched: `learning-platform-core`, `learning-platform-backend`, `learning-platform-admin`, `learning-platform-reports`, `unit-3-Cyber-Security-Hub`, `tlevel-software-development-hub`, `unit-14-software-engineering-for-business-hub`, `Emerging-Digital-Technologies-Hub`, plus hub clones that share the same Core client.

Vendor/`dist` copies of Core were treated as generated; source of truth is `learning-platform-core/src`.

### 2.1 Shared Core client (all learner hubs)

| File | Function / component | Operation | Table / RPC | When it executes | Potential frequency | Audience |
|---|---|---|---|---|---|---|
| `src/core/api/supabase-client.js` | `createSupabaseClient` | `createClient` | Auth + REST + Realtime | Hub boot | Once per page/session | Learner |
| `src/core/api/learner-api.js` | `getProfile` | `from().select()` | `api.my_profile` | Learner refresh | Once per refresh | Learner |
| `src/core/api/learner-api.js` | `ensureLearnerAuthLink` | `rpc` | `api.ensure_learner_auth_link` | Before every profile read; identity recovery | Once per refresh, plus recovery | Learner |
| `src/core/api/learner-api.js` | `getEnrolments` | `from().select()` | `api.my_enrolments` | Learner refresh | Once per refresh | Learner |
| `src/core/api/learner-api.js` | `getAssignments` | `from().select()` | `api.my_assignments` | Not used on the main hub-ready path | Rare | Learner |
| `src/core/api/learner-api.js` | `getHubAssignments` | `rpc` | `api.my_hub_assignments` | After hub access resolves enrolled | Once per ready transition | Learner |
| `src/core/api/learner-api.js` | `resolveLearnerHubAccess` | `rpc` | `api.resolve_learner_hub_access` | After learner authenticated | Once per ready transition | Learner |
| `src/core/api/learner-api.js` | `getCurriculumDelivery` | `from().select()` | `api.my_activity_delivery` | Available, not on default boot | Rare | Learner |
| `src/core/api/learner-api.js` | `getAttempts` | `from().select()` | `api.my_attempts` | If a hub asks for attempts | Per activity | Learner |
| `src/core/api/learner-api.js` | `getResponses` | `from().select()` | `api.my_responses` | If a hub asks for responses | Per activity | Learner |
| `src/core/api/learner-api.js` | `getProgress` | `from().select()` | `api.my_activity_progress` | Unit 3 `backend-progress.reconcile` (no activity filter) | Per page that loads that script | Learner |
| `src/core/api/learner-api.js` | `getActivityState` | `rpc` | `api.get_activity_state` | Store `hydrate` | Per activity open / week fan-out / realtime invalidation | Learner |
| `src/core/api/learner-api.js` | `saveActivityState` | `rpc` | `api.save_activity_state` | Store `save` / `flush` | Every debounced draft change; immediate on Check/Finish | Learner |
| `src/core/api/learner-api.js` | `clearActivityState` | `rpc` | `api.clear_activity_state` | Reset / clear | Rare | Learner |
| `src/core/api/learner-api.js` | `completeOnboarding` | `rpc` | `api.complete_learner_onboarding` | Register / join | Once per onboarding | Learner |
| `src/core/api/learner-api.js` | `joinLearnerHubGroup` | `rpc` | `api.join_learner_hub_group` | Join class | Once per join | Learner |
| `src/core/api/learner-api.js` | `submitAttempt` | `rpc` | `api.submit_attempt` | Finish activity | Once per completion (idempotent) | Learner |
| `src/core/api/learner-api.js` | `markFormativeResponse` | `rpc` | `api.mark_formative_response` | Check / mark block | Once per Check | Learner |
| `src/core/api/learner-api.js` | `getPublishedCurriculumPackage` | `rpc` | `api.published_curriculum_package` | Curriculum load | **Every successful `loadLatest()`** — localStorage is fallback-on-error, not cache-first | Learner |
| `src/core/auth/auth-service.js` | `initialise` | `auth.getSession` + `auth.getUser` | Auth | Hub start | Once per load | Learner |
| `src/core/auth/auth-service.js` | `onAuthStateChange` | Auth listener | Auth | Session events including `TOKEN_REFRESHED` | ~hourly + tab focus | Learner |
| `src/core/auth/auth-service.js` | `signIn` / `signUp` / `signOut` / `refreshSession` | Auth API | Auth | User action / recovery | Low | Learner |
| `src/core/progress/activity-state-sync.js` | `start` | `realtime.setAuth` + `channel().subscribe` | Realtime `learner-state:{userId}` | On authenticated | One subscription per signed-in session | Learner |
| `src/core/profile/profile-service.js` | `getProfile` | ensure + select | `ensure_learner_auth_link` then `my_profile` | Every learner refresh | 2 requests per refresh | Learner |
| `src/platform.js` | `initialise` / learner subscriber | Combined boot | ensure, profile, enrolments, hub access, assignments | Hub open; again on `authenticated` events | See §7 | Learner |
| `src/platform.js` | `refreshHubSession` | refresh + refresh + resolve + assignments | Auth + learner RPCs | Explicit session recovery | Low | Learner |
| `src/platform.js` | `online` listener | `learner.refresh` | profile/enrolments | Browser `online` event | Occasional | Learner |

### 2.2 Unit 3 Cyber Security Hub (learner)

| File | Function | Operation | Table / RPC | When | Frequency | Audience |
|---|---|---|---|---|---|---|
| `src/platform.ts` | `createHubPlatform` | `createClient` with auth-gated `fetch` | All Core RPCs | Hub boot | Once | Learner |
| `src/platform.ts` | `recoverLearnerAfterAuthRestore` | extra `getSession` + `learner.refresh` (up to twice) | ensure, profile, enrolments | After Core initialise if already authenticated | 1–2 extra refreshes per load | Learner |
| `src/auth-gated-fetch.ts` | `waitForUserAccessToken` | `auth.getSession` loop | Auth (local in current supabase-js; still a hot path) | Learner RPCs without a user JWT | Up to ~2.5s, 25–200ms backoff | Learner |
| `src/hooks/useHubPlatform.ts` | mount effect | `platform.initialise` + `curriculum.loadLatest` | Boot + published package | SPA mount | Once per SPA session | Learner |
| `src/pages/WeekPage.tsx` / tlevel equivalent | week hydrate effect | `store.hydrate` per activity | `get_activity_state` | Week open | **N activities in the week** | Learner |
| `src/pages/ActivityPage.tsx` | hydrate + persist | `get_activity_state` / `save_activity_state` | Same | Open activity; Check/Finish | 1 read; writes on Check (`immediate`) | Learner |
| `src/catalogue/activity-draft.ts` | `persistCatalogueDraft` | `store.save` | `save_activity_state` | Check / finish | Immediate on completed Check | Learner |
| `js/activity-state.js` | `setResponse` / `setChecked` | `store.save` | `save_activity_state` | Answer / Check | Debounced on answer; immediate on Check | Learner |
| `js/core/backend-progress.js` | `reconcile` | `progress.getProgress()` then hydrate weeks 2–7 | `my_activity_progress` + many `get_activity_state` | Script load + auth authenticated | Per page that includes the script | Learner |
| `js/core/remote-learner-work.js` | `persistOntoCarriers` | hydrate + `save(..., { immediate: true })` **per carrier** | `get_activity_state` + `save_activity_state` × 2 | Every week-root persist | **2 writes per local edit** | Learner |
| `js/core/remote-learner-work.js` | `persistWeekRoot` / `persistStorageKey` | same | same | `updateActivity` / `setDraft` / `saveRegister` | Immediate | Learner |
| `js/core/backend-progress.js` | wrapped `updateActivity` **and** `setDraft` | both call `persistWeekRoot` | `save_activity_state` | One UI edit can fire persist twice | 2× on top of carrier fan-out | Learner |
| `content/engine/interactive.js` | `input` / `change` / `lp-block-result` | `store.save` | `save_activity_state` | Every text keystroke (debounced); Check immediate | High while typing | Learner |
| `js/core/supabase-learning-api.js` | `submitAttempt` | `rpc` | `submit_attempt` | Final submit | Low | Learner |

### 2.3 T Level Software Development Hub (learner)

Same Core boot as Unit 3. Additional high-frequency paths:

| File | Function | Operation | When | Frequency | Audience |
|---|---|---|---|---|---|
| `src/pages/WeekPage.tsx` | hydrate all week activities | `get_activity_state` × N | Week open | High burst | Learner |
| `content/engine/interactive.js` | `input` listener | `save` debounce 600ms | Typing | Up to ~100 writes/min while typing | Learner |
| `js/activities/activity-state.js` | `FoundationActivityState.save` | Core `save` | Answer / section / submit | Per interaction | Learner |
| `js/activities/activity-engine.js` | `collectCurrentResponses` | `store.save` | Section navigation / submit | Per section | Learner |
| `js/core/supabase-learning-api.js` | `submit_attempt` | RPC | Submit | Low | Learner |
| `js/core/supabase-analytics.js` | `studentProgress()` | `getProgress()` + `getAttempts()` + `my_hub_assignments` **unscoped** | Foundations landing | **3 extra reads** on top of hub boot | Learner |

### 2.3b Other learner hubs

| Hub | Distinct amplifiers |
|---|---|
| Unit 14 (`unit-14-software-engineering-for-business-hub`) | Older `content/engine/interactive.js` calls `submitActivityDraft` → `submit_attempt` **on every completed Check**, not only Finish. `src/main.tsx` uses React StrictMode (double `initialise` in development / some builds). |
| L2E / Emerging Digital Technologies | Same week-engine pattern as T Level (600ms typing, immediate Check). EDT `src/platform.ts` loads the L2E package and uses hubId `l2e-exploring-emerging-digital-technologies`. If both sites are deployed they **duplicate the same hub identity**. |
| Year 1 Readiness (`level-3-it-year-1-readiness-hub`) | Core progress is off. Diagnostic RPCs (`start_diagnostic`, `submit_diagnostic_response`, `complete_diagnostic`) **`createClient` per call**. StrictMode on. Low classroom volume relative to teaching hubs. |

Local checkouts currently depend on `file:../learning-platform-core` (**0.2.23**), which already dedupes week re-render hydrates. **Deployed** hubs may still be on older Core (changelog: 0.2.22 fixed WeekPage re-render storms; 0.2.23 bounded identity retries). Confirm production bundle versions before assuming those guards are live.

Empty `activityKey` filters in Core `read()` are skipped, so `getProgress()` / `getAttempts()` / `getResponses()` **without a key** become unscoped `SELECT *` on those views.

### 2.4 Central Admin Portal (`learning-platform-admin`)

| File | Function | Operation | Table / RPC | When | Frequency | Audience |
|---|---|---|---|---|---|---|
| `src/services/supabase-admin-service.ts` | `createSupabaseAdminClient` | `createClient` (`admin_api` schema) | Auth + REST | Portal boot | Once | Admin |
| `src/stores/admin-portal.tsx` | `onAuthStateChange` | Auth | Auth | Boot / sign-in / refresh | Low | Admin |
| `src/stores/admin-portal.tsx` | `bootstrapSession` | `current_staff_context` + dashboard summary | `admin_api` views | Sign-in / `INITIAL_SESSION` / `SIGNED_IN` only — **not** `TOKEN_REFRESHED` | Once per session | Admin |
| `src/stores/admin-portal.tsx` | `loadModuleData` | extra `getSession` then module reads | Many views | First visit to a module | Per module | Admin |
| `src/services/admin-data-loaders.ts` | `loadDashboardData` | 4–5 parallel selects | health, recent attempts, hubs, contracts | Open dashboard | Burst | Admin |
| same | `loadHubsCurriculumData` | 6 selects | hubs, links, courses, publications, drafts, audit | Open hubs/curriculum | Burst | Admin |
| same | `loadPeopleData` | 4 selects | learners, groups, teachers, enrolments | Open people | Burst | Admin |
| same | `loadAssignmentsResultsData` | 7 selects | assignments, attempts, responses, diagnostics, … | Open results | Burst; `attempts`/`responses` unpaged | Admin |
| same | `loadAnalyticsData` | 12 selects, several `pagedRows` | question/learner/activity analytics | Open analytics | Burst; 1 request per 1,000 rows | Admin |
| same | `loadSystemData` | 5 selects | health, hubs, contracts, audit, teachers | Open system | Burst | Admin |
| `src/views/group-generator.tsx` | `setInterval` | `rpc get_grouping_session` | `admin_api.get_grouping_session` | While session open and not closed | **Every 2.5s**, including hidden tabs | Admin |
| `src/views/curriculum-authoring.tsx` | autosave | `rpc save_curriculum_draft` | `admin_api.save_curriculum_draft` | Editing | Debounced 800ms | Admin |
| `src/views/module-content.tsx` | `onLoadRemoteDrafts` | `get_curriculum_draft` **per draft id** | `admin_api.get_curriculum_draft` | Open curriculum | N RPCs | Admin |
| `src/views/hub-learning-results.tsx` | filter + results effects | `list_hub_learning_result_filters` then `list_hub_learning_results` + `summarise_hub_learning_results` | admin RPCs | Mount and **every filter change**; results effect also re-fires when filter rows arrive | **2 RPCs per filter**; ~5 on first open | Admin |
| `src/services/supabase-admin-service.ts` | mutations | various RPCs | publish, visibility, review, hub register | Staff actions; `review_response` invalidates **assignments-results + analytics** (re-runs the analytics burst) | Low actions, expensive invalidation | Admin |

### 2.5 Reports (`learning-platform-reports`)

| File | Operation | RPC | When | Frequency | Audience |
|---|---|---|---|---|---|
| `src/api/reporting-api.ts` | `createClient` + `rpc` | `api.my_hub_activity_progress` | Open reports | Per hub view | Admin / staff |

### 2.6 Backend (does not originate browser requests)

Postgres functions, RLS, and the uncommitted Realtime broadcast trigger live in `learning-platform-backend`. They execute **when the clients above call them**. The uncommitted migration `supabase/migrations/20260912120000_activity_state_revision_realtime.sql` would add `realtime.send` on every `learning.activity_states` write.

---

## 3. Highest-frequency request paths

Ranked by how well they can produce millions of requests, not by how “important” the feature is.

| Rank | Path | Why it is hot |
|---|---|---|
| 1 | `api.save_activity_state` | Bound to typing (`input` → 600ms debounce) and Unit 3 `immediate: true` multi-carrier writes |
| 2 | Realtime channel `learner-state:{userId}` | One private channel per signed-in learner for the whole session; heartbeats if counted |
| 3 | `api.get_activity_state` | Week-open fan-out + Unit 3 carrier hydrates + realtime invalidation |
| 4 | Hub bootstrap cluster | `getUser` + `ensure_learner_auth_link` + `my_profile` + `my_enrolments` + `resolve_learner_hub_access` + `my_hub_assignments` (+ Unit 3 extra refresh) |
| 5 | `api.mark_formative_response` | One RPC per Check |
| 6 | `api.published_curriculum_package` | **Every hub open** — success path always RPCs; cache is error fallback only |
| 7 | Admin module reads | Large parallel selects; Group Generator 2.5s poll; Hub Learning 2 RPCs/filter |
| 8 | `api.submit_attempt` | Finish on modern hubs; **every completed Check on Unit 14** |

---

## 4. Polling analysis

### 4.1 Learner hubs — no idle Supabase poller found

Searched `setInterval`, visibility/focus handlers, and “refresh” loops that call Supabase.

| Mechanism | Interval | Request | Continues while idle? | Continues when tab hidden? | Est. requests / user / hour |
|---|---|---|---|---|---|
| Activity-state **debounce timer** (`debounceMs = 600`) | 600ms after last change | `save_activity_state` | **No** — only after a state change | Yes if the user typed just before hiding (one flush) | 0 when idle; up to ~6,000 while continuously typing |
| `pagehide` / `beforeunload` | Event | `save_activity_state` flush | No | On leave | 1 per navigation away |
| Auth `autoRefreshToken: true` | SDK tick ~30s locally; network when JWT near expiry | Auth refresh | Yes while session exists | SDK typically refreshes on visibility | ~1 network refresh / hour unless focus storms |
| Unit 3 `waitForUserAccessToken` | 25–200ms for ≤2.5s | `getSession()` | Only during gated RPCs without a user JWT | N/A | Burst at start, not hourly |
| Unit 3 OCR / quiz `setInterval` | 1s | **Local timer UI only** | Yes on those pages | Yes | **0 Supabase** |
| Unit 3 vulnerability-register save | 400ms debounce | Goes through `saveRegister` → remote persist | After edits only | Yes | High while typing, 0 idle |

**Conclusion:** there is no “every 5 seconds forever” learner poller. The dangerous pattern is **event-driven persistence that is almost as hot as polling during lessons**.

### 4.2 Admin Portal

| Mechanism | Interval | Request | Idle / hidden | Est. / admin / hour |
|---|---|---|---|---|
| Group Generator `POLL_MS = 2500` | 2.5s | `get_grouping_session` | Continues while session status ≠ `closed`. **No `document.hidden` guard.** | 1,440 |
| Curriculum authoring autosave | 800ms after edit | `save_curriculum_draft` | After edits only | Low–medium while authoring |
| Dashboard / analytics | none | Module load on navigate | Does not auto-refresh if left open | 0 while idle after load |

One admin leaving Group Generator open for a teaching day (6h) ≈ 8,640 requests. Ten admins doing that all month still cannot explain 9.4M. Treat as HIGH locally, not the platform-wide cause.

---

## 5. Authentication analysis

### 5.1 What is already in memory

Core `auth.getSession()` **returns the in-memory `state.session`**. It does not hit the network.

Network Auth calls:

- `client.auth.getSession()` inside `auth.initialise()` (SDK restore)
- `client.auth.getUser()` to prove the cached user still exists
- `signInWithPassword` / `signUp` / `signOut` / `refreshSession`
- SDK `autoRefreshToken: true`

### 5.2 Unnecessary / repeated Auth-driven work

**Problem A — `getUser()` on every hub load.** Justified for stale-session detection after server-side user deletion. Cost is 1 Auth request per page/SPA start, not millions, but it is on the hottest path.

**Problem B — `onAuthStateChange` treats every session event as a full login.**

```127:136:learning-platform-core/src/core/auth/auth-service.js
    client.auth.onAuthStateChange?.((event, session) => {
      if (!restoreComplete) return;
      if (event === "SIGNED_OUT" || !session) {
        // ...
      } else {
        publish({ status: "authenticated", session, error: null });
      }
    });
```

`TOKEN_REFRESHED` therefore republishes `authenticated`. Downstream:

- `learner-context` calls `refresh()` → `ensure_learner_auth_link` + `my_profile` + `my_enrolments`
- `platform.js` subscriber calls `hubAccess.resolve()` + `my_hub_assignments`
- `activityStateSync.start()` calls `realtime.setAuth()` again

**Problem C — double refresh on Unit 3 start.** Core `initialise` already refreshes the learner after Auth is proven. Unit 3 then `recoverLearnerAfterAuthRestore()` may call `learner.refresh()` once or twice more.

**Problem D — `ensure_learner_auth_link` before every profile read.** Linking Auth→roster is needed, but it does not need to run on every token refresh.

**Problem E — Admin `getSession()` before every module load** (`admin-portal.tsx` around the `loadModuleData` path). Local in recent supabase-js, but extra Auth work on every module.

Auth state **can** be reused: after the first successful `getUser()` / bootstrap, later components should read `auth.getState()` / `auth.getSession()` (memory) instead of re-validating.

---

## 6. Learner progress request analysis

Assumptions for counts: signed-in learner, enrolled, publication available. Writes are `save_activity_state` unless noted.

### 6.1 Opens a hub

Typical Core sequence:

1. `auth.getSession` (SDK) + `auth.getUser` (network)
2. Realtime `setAuth` + `channel.subscribe` (`learner-state:{uid}`)
3. `ensure_learner_auth_link`
4. `my_profile`
5. `my_enrolments`
6. `resolve_learner_hub_access`
7. `my_hub_assignments`
8. `published_curriculum_package` (**always** on `loadLatest()` success; localStorage is used only after a failed fetch)

**≈ 8–10 HTTP/Auth/Realtime setup requests.**

Unit 3 adds 1–2 extra learner refreshes (another 2–6 REST calls).

If the learner is already in `enrolled_created` / `enrolled_reactivated` with a new group code, `platform.js` calls `learner.refresh` **again**.

### 6.2 Opens a week

T Level / content-engine `WeekPage`:

- `get_activity_state` **once per activity in the week**, in parallel.
- Each activity also gets a store `subscribe` (in-memory; Realtime is already global).

If a week has 20 activities → **20 `get_activity_state` RPCs** on open, even if the learner only looks at the first one.

Unit 3 week pages that inject `backend-progress.js` also:

- `my_activity_progress` (all rows; filter omitted because no `activityKey`)
- `hydrateWeekRoot` for **weeks 2–7**, two carriers each → up to **~12 extra `get_activity_state`**

### 6.3 Opens a lesson / activity

- `get_activity_state` if not already completed/deduped for that key
- Content engine dispatches a synthetic `input` event on textareas after bind (fingerprint should skip an identical write)

### 6.4 Answers a question

Depends on engine:

| Surface | Behaviour | RPCs |
|---|---|---|
| Content-engine text (`interactive.js` `input`) | `save` with 600ms debounce | 1 `save_activity_state` per pause in typing |
| Content-engine MCQ `change` | `persistLocal` (`remote: false`) | 0 until Check |
| Unit 3 Activity API `setResponse` | `save` (debounced) | 1 per pause |
| Unit 3 catalogue React `onResult` incomplete | `remote: false` | 0 |
| Unit 3 host `updateActivity` / `setDraft` / register | `immediate: true` onto **all carriers for that week** | **2 `save_activity_state` per edit** |

### 6.5 Submits / Checks an answer

Typical Check:

1. `mark_formative_response` (if React `InteractiveActivity` / Core marking is wired)
2. `save_activity_state` with `{ immediate: true }`
3. Unit 3 may also dispatch `lp-block-result`, which can cause **interactive.js to save again**
4. Unit 3 `markCompleted` → `persistWeekRoot` → **two carrier saves**

**A single Check can be 2–5 RPCs** without changing learner-visible behaviour.

### 6.6 Moves to the next activity

- Flush pending debounce (`pagehide` or immediate save)
- New `get_activity_state` for the next key
- SPA: Core client reused (good). Full HTML navigation: **full hub bootstrap repeats**.

### 6.7 Completes an activity

- Immediate `save_activity_state`
- `submit_attempt` once
- Fingerprint + Core tests exist to avoid duplicate submits; still one REST write for the attempt

### 6.8 Leaves / returns

- Leave: `pagehide`/`beforeunload` flush (1 save if dirty)
- Return same SPA session: hydrate short-circuited by `completedReads`
- Return after `platform.destroy()` (Unit 3 `useHubPlatform` cleanup on true unmount): **dedupe maps are reset** → hydrates and bootstrap run again
- Tab focus: Auth SDK may refresh the token → Problem B in §5 fires the learner refresh cluster again

---

## 7. Admin Portal request analysis

### 7.1 Opens the dashboard

1. `onAuthStateChange` / `getSession`
2. `current_staff_context`
3. `dashboard_summary` (bootstrap)
4. On dashboard module auto-load: health, recent attempts, hubs, contracts (summary reused if bootstrap already has it)

**≈ 6–8 requests.** Cached until refresh/mutation.

### 7.2 Selects a course / group

- **Analytics** — client-side `updateScope()`. **0 extra requests.**
- **Hub Learning (Results)** — `list_hub_learning_results` + `summarise_hub_learning_results` **on every filter change**, including a second pair when filter options arrive (`hub-learning-results.tsx`). Typical first open ≈ 5 RPCs, then 2 per filter. No debounce.

### 7.3 Opens learner progress / results / analytics

`assignments-results`: 7 parallel reads including **full `attempts` and `responses` in a single unpaged `select`** (PostgREST will cap, default 1,000 — silent truncation risk, but still 1 HTTP each).

`analytics`: 12 reads; several use `pagedRows` (1,000/page). `learner_activity_performance` and `question_performance` can be multiple requests as data grows.

Tests already synthesise 1,200–1,560 row pages, so Analytics is expected to cost **tens of requests per open**, not thousands per second.

### 7.4 Leaves the dashboard open

No dashboard poller. Data goes stale until navigation/retry/mutation invalidation.

### 7.5 Overlap

`hubs`, `health`, `contracts`, `auditEvents`, diagnostic tables are fetched independently by multiple modules. Cache is per module, not global. Visiting Dashboard then System then Hubs repeats overlapping reads.

---

## 8. Realtime subscription analysis

| Item | Detail |
|---|---|
| Client factory | `createActivityStateSync` in `platform.js`; `start()` when Auth status is `authenticated` |
| Topic | `learner-state:{userId}` (private channel) |
| Event | `activity_state_invalidated` |
| Purpose | Cross-tab / reconnect refresh of in-progress drafts |
| Duplicate subscriptions | `start()` reuses the channel if the user id matches; calls `realtime.setAuth()` again |
| Cleanup | `stop()` / `reset()` on sign-out and `platform.destroy()` |
| Required? | Useful for two tabs; **not required** for single-tab classroom use |
| Server broadcast | Implemented in **uncommitted** backend migration `20260912120000_activity_state_revision_realtime.sql`. Client already subscribes even if the server never sends |

Reconnect handler `reconcileOnce()` force-hydrates **every registered activity store**. After a flaky network, that is N extra `get_activity_state` calls.

If production already has an older broadcast trigger without revision filters, a save could echo back as a hydrate (`fresh: true`). Core tries to ignore current-or-older revisions **once the uncommitted migration’s `revision` field is present**.

---

## 9. Estimated request-volume calculations

### 9.1 Shared assumptions (stated, not taken as fact)

| Parameter | Value used | Notes |
|---|---|---|
| Active learners | 180 | 6 groups × 30 |
| Permanently concurrent | **No** | Use teaching-hour concurrency |
| Teaching days / month | 20 | Term-time approximation |
| Teaching hours / day | 4 class-hours of hub use | Not 24h |
| Concurrent during a class | 30 | One group |
| Hubs in play | 1–2 per learner | Unit 3 + T Level would roughly double bootstrap + subscriptions |
| `save_activity_state` debounce | 600ms | Core default |
| JWT refresh | ~1 / learner-hour | Typical 1h access token |

9.4M / month ≈ **313k / calendar day**, or **~470k / teaching day** if all volume is on 20 days, or **~118k / class-hour** if concentrated in 4 hours × 20 days.

### 9.2 Scenario A — typing-driven draft saves (can explain millions)

20 of 30 learners in a class type into text / register fields for 20 minutes.

`save_activity_state` at 600ms debounce while typing ≈ 100 writes/min.

- 20 learners × 100/min × 20 min = **40,000 writes / class**
- 4 classes/day × 20 days = **3.2M writes / month**

Unit 3 carrier amplification (`immediate: true` × 2 keys) on host worksheets:

- Same 20 minutes of register typing at ~2–3 keystroke pauses/sec is lower because 400ms local debounce then **2 RPCs**
- 20 learners × ~75 persist events/min × 2 RPCs × 20 min = **60,000 / class** → **4.8M / month** if that pattern ran every class (upper bound)

These are **upper bounds for active typing**, not 180 learners typing all day. They show that draft writes **can** reach the reported magnitude.

### 9.3 Scenario B — week-open hydrates (HIGH, not sufficient alone)

30 learners open a 20-activity week:

- 30 × 20 = **600 `get_activity_state`**
- 4 classes/day × 20 days = **48,000 / month**

Unit 3 extra 12 carrier hydrates × 30 × 4 × 20 = **28,800 / month**.

Burst, not millions, unless learners refresh constantly.

### 9.4 Scenario C — hub bootstrap + token refresh (HIGH combined)

Per learner-hour (one hub):

- Start: ~10 requests
- Token refresh: ~5 REST + `realtime.setAuth`
- Total ≈ **15 / learner-hour**

30 concurrent × 4 hours × 20 days = **36,000 / month**. Two hubs → ~72k. Not millions.

Unit 3 extra refreshes on every full load matter more if learners use many distinct HTML navigations. If each learner does 40 full boots/day: 180 × 40 × 10 × 20 = **1.44M / month**.

SPA (React App) avoids this; classic multi-page loads do not.

### 9.5 Scenario D — Realtime heartbeats **if counted as requests** (can explain millions)

Private channel held open for each in-class learner.

Assume a heartbeat / websocket frame every 15s = 240 frames/hour.

- 30 concurrent × 240 × 4h × 20d = **576,000 / month** (one group at a time)
- If 180 learners leave hubs open in background all school day (6h): 180 × 240 × 6 × 20 = **5.2M / month**

**This only applies if the 9.4M metric includes Realtime.** Confirm in the Supabase dashboard breakdown (API vs Realtime messages vs Auth).

### 9.6 Scenario E — 5-second poller (for comparison; **not found**)

The example 5s poller × 180 concurrent × teaching time would be huge, but **no such learner poller exists**. Do not spend effort hunting one.

### 9.7 Scenario F — Admin Group Generator

1 admin × 1,440 req/hour × 6h × 20d = **172,800 / month**. Secondary.

### 9.8 Combined picture that can reach ~9.4M

A plausible mix **without** assuming 180 permanent concurrent users:

| Source | Order of magnitude / month |
|---|---|
| Draft saves during lessons (incl. Unit 3 double-write) | 2M–6M |
| Realtime frames **if counted** | 0.5M–5M |
| Hub boots from MPA navigations + refresh | 0.2M–1.5M |
| Week hydrates + Check/mark RPCs | 0.1M–0.5M |
| Admin | <0.3M unless Group Generator is left open widely |
| **Total** | **Can overlap 9.4M** |

---

## 10. Findings (ranked)

### CRITICAL

#### C1 — Draft `save_activity_state` is effectively a live stream during lessons

- **File / function:** `learning-platform-core/src/core/progress/activity-state.js` `save()` (default `debounceMs = 600`); `tlevel-software-development-hub/content/engine/interactive.js` `input` listener; Unit 3 `js/activity-state.js` `setResponse`
- **Current behaviour:** Every text `input` schedules a remote save. Fingerprinting skips identical payloads, but each new character changes the payload.
- **Why requests:** One HTTP RPC per debounce window while typing.
- **Estimated impact:** Millions/month during teaching (Scenario A).
- **Recommended solution:** Keep local saves immediate; increase remote debounce for **in-progress text** (e.g. 5–15s) and always flush on Check, Finish, `pagehide`, and visibility hidden. Do **not** drop the write path.
- **Risk:** Medium if debounce is too long and the tab is killed before flush. Mitigate with `pagehide` (already present) + `visibilitychange` flush.

#### C2 — Unit 3 host work writes two activity rows immediately per edit

- **File / function:** `unit-3-Cyber-Security-Hub/js/core/remote-learner-work.js` `persistOntoCarriers`, `persistWeekRoot`, `saveWork(..., { immediate: true })`; hooked from `backend-progress.js` `updateActivity` / `setDraft` / `saveRegister`
- **Current behaviour:** A single local draft update hydrates then immediately saves **every carrier** for that week (typically two keys). Bypasses 600ms debounce. `backend-progress.js` wraps **both** `updateActivity` and `setDraft`, so one UI edit can persist twice, then ×2 carriers.
- **Why requests:** Up to 4× write amplification, no coalescing across keystrokes beyond the 400ms register UI timer.
- **Estimated impact:** Can independently reach millions if worksheets are used heavily (Scenario A, Unit 3 branch).
- **Recommended solution:** Persist locally first; debounce remote; write **one** published activity key (the one being edited), not all carriers; use Core default debounce instead of `immediate: true` for intermediate keystrokes.
- **Risk:** Medium — must not lose week-root drafts (`weekRoot.drafts`). Add tests that a register typed then abruptly closed still arrives once.

#### C3 — Realtime subscription for every signed-in learner (metric-dependent)

- **File / function:** `learning-platform-core/src/core/progress/activity-state-sync.js`; started from `platform.js`
- **Current behaviour:** Private channel from login until sign-out. Client subscribes even if server broadcast is not deployed. Uncommitted SQL would `realtime.send` on every activity_states write.
- **Why requests:** Websocket join + heartbeats + optional echo hydrates.
- **Estimated impact:** 0.5M–5M+ **if** Realtime is inside 9.4M.
- **Recommended solution:** Confirm dashboard metric. If Realtime is in the number: delay `start()` until two tabs or an explicit cross-device need; stop channel when `document.hidden` for a threshold; do not deploy broadcast until revision filtering is proven.
- **Risk:** Low for single-tab classrooms; two-tab draft sync would be slower.

### HIGH

#### H1 — `TOKEN_REFRESHED` re-runs learner bootstrap

- **File / function:** `auth-service.js` `onAuthStateChange`; `learner-context.js` `refresh`; `platform.js` learner subscriber
- **Current behaviour:** Any Auth event with a session republishes `authenticated`, refetching profile, enrolments, hub access, assignments.
- **Estimated impact:** Hundreds of thousands if many boots; more if visibility-triggered refresh is frequent.
- **Recommended solution:** Ignore `TOKEN_REFRESHED` for learner data reloads; update in-memory session only. Keep `SIGNED_IN` / first `INITIAL_SESSION`.
- **Risk:** Low if JWT claims used for RLS stay valid until expiry (they do). Do not skip `SIGNED_OUT`.

#### H2 — Week page hydrates every activity

- **File / function:** `tlevel-software-development-hub/src/pages/WeekPage.tsx` (and Unit 3 equivalent week hydrate)
- **Current behaviour:** `Promise.all(activities.map(store.hydrate))`
- **Estimated impact:** Tens of thousands to low hundreds of thousands/month; worse with re-mounts that call `resetActivityStateDedupe`.
- **Recommended solution:** Hydrate visible / opened activity only; use in-memory week summary if a progress strip is required.
- **Risk:** Low for scoring; week progress UI must fall back to local cache.

#### H3 — Unit 3 `backend-progress.reconcile` hydrates all weeks 2–7 on script load

- **File / function:** `js/core/backend-progress.js` `reconcile`
- **Estimated impact:** Extra ~12 reads per affected page load, plus `my_activity_progress` unfiltered.
- **Recommended solution:** Hydrate **current week only**. Pass `activityKey` to `getProgress` if a single-activity read is enough; otherwise keep one unfiltered read but drop cross-week hydrates.
- **Risk:** Low if week dashboards only need that week.

#### H4 — Hub-open request cluster is duplicated (Core + Unit 3 recovery + ensure-on-every-profile)

- **File / function:** `platform.js` `initialise`; `profile-service.js`; `unit-3 .../src/platform.ts` `recoverLearnerAfterAuthRestore`
- **Estimated impact:** 2–3× bootstrap REST on Unit 3 loads.
- **Recommended solution:** One `ensure_learner_auth_link` per session unless identity error; Unit 3 recovery only if learner status is actually `onboarding-required`.
- **Risk:** Low; keep the 403-on-restore bug fix, just don’t refresh twice when already authenticated.

#### H5 — Check / complete can multi-write

- **File / function:** `ActivityPage.tsx` persist + `lp-block-result`; `interactive.js` listener; `setChecked` immediate; `mark_formative_response`
- **Estimated impact:** 2–5 RPCs per Check × questions × learners.
- **Recommended solution:** One immediate save owner per surface; keep `mark_formative_response` (needed for marking). Do not coalesce Check with “skip save”.
- **Risk:** Medium if duplicate listeners are removed incorrectly.

#### H6 — Unit 14 `submit_attempt` on every completed Check

- **File / function:** `unit-14-software-engineering-for-business-hub/content/engine/interactive.js` (~196–200)
- **Current behaviour:** `lp-block-result` with `completed` calls `submitActivityDraft` immediately. T Level / L2E require Finish. This older engine does not.
- **Why requests:** One `submit_attempt` per Check, plus draft save. Inflight fingerprinting in newer `submit.js` is absent here.
- **Estimated impact:** HIGH if Unit 14 is in live classroom use; can exceed legitimate completion volume by 10–20× per activity.
- **Recommended solution:** Align with T Level: save draft on Check, `submit_attempt` only on Finish. **Do not** drop Check marking if/when that hub uses `mark_formative_response`.
- **Risk:** Medium — learner-visible “saved to learning record” timing changes. Must still persist the official attempt on Finish.

#### H7 — T Level foundations unscoped triple-read

- **File / function:** `tlevel-software-development-hub/js/core/supabase-analytics.js` `studentProgress()`
- **Current behaviour:** Parallel `getProgress()`, `getAttempts()`, `getHubAssignments()` with no activity filter (Core skips empty filters → full views). Assignments were already loaded at hub boot.
- **Estimated impact:** 3 extra REST calls per foundations landing; payload can be large. Not millions alone.
- **Recommended solution:** Reuse hub-boot assignments; scope progress/attempts or drop this overlay if week hydrates already cover status.
- **Risk:** Low.

#### H8 — Production Core older than 0.2.22 would re-hydrate on every WeekPage re-render

- **File / function:** Core 0.2.22 `completedReads` / in-flight sharing (`CHANGELOG.md`); tests use 28 activities × 200 re-render waves.
- **Current behaviour:** Current tree is 0.2.23. If a deployed hub still ships pre-0.2.22, week re-renders become **O(activities × renders)** `get_activity_state`.
- **Estimated impact:** Could independently explain millions **if production is not on 0.2.22+**.
- **Recommended solution:** Phase 0 — confirm the shipped Core version on each live hub. If old, ship 0.2.23 before other optimisations.
- **Risk:** Low (already tested).

### MEDIUM

#### M1 — Admin Group Generator 2.5s poll without hidden-tab pause

- **File:** `learning-platform-admin/src/views/group-generator.tsx`
- **Solution:** Pause when `document.hidden`; increase interval; use Realtime only if a live grouping session truly needs it.
- **Risk:** Low.

#### M2 — Admin overlapping module queries

- **File:** `admin-data-loaders.ts`
- **Solution:** Share hubs/health/contracts across modules; page `responses`/`attempts` instead of unbounded `select`.
- **Risk:** Low for behaviour; watch empty vs truncated lists.

#### M3 — `getUser()` on every initialise

- Needed for stale session. Cache “validated at” for the SPA lifetime.
- **Risk:** Low; do not skip first validation.

#### M4 — Auth-gated fetch retries `getSession` for 2.5s

- **File:** `unit-3-Cyber-Security-Hub/src/auth-gated-fetch.ts`
- Likely local; still noisy. Gate on in-memory Core auth instead of polling SDK.
- **Risk:** Low.

#### M5 — Curriculum package RPC on each hub open (not cache-first)

- **File:** `published-curriculum-service.js` `load()` — always `fetchPublishedPackage`; `cache.read` only in the `catch` path.
- **Solution:** If content hash/version is unchanged, skip the RPC (must not serve a stale published package after a tutor publish).
- **Risk:** Medium if cache-first is naive. Prefer short TTL or `content_hash` compare.

#### M6 — Admin `getSession` before every module fetch

- **File:** `admin-portal.tsx` `loadModuleData`

### LOW

#### L1 — `submit_attempt` / onboarding / join class / password reset

Necessary, rare.

#### L2 — Reports `my_hub_activity_progress`

Once per view.

#### L3 — Identity-storm retries

Already bounded (`activity-state-identity-storm.test.js`, max one `ensure_learner_auth_link`, permanent block after identity failure). Do not undo those guards.

#### L4 — `online` event learner.refresh

Occasional.

#### L5 — Hub Learning filter refetch; `get_curriculum_draft` × N; analytics invalidation after one review

Admin-only. Pause/debounce Hub Learning filters; load one draft at a time; invalidate only the results module after a single mark.

#### L6 — Year 1 diagnostic `createClient` per RPC

Low volume. Reuse one client.

---

## 11. Recommended optimisation plan (not implemented)

### Phase 0 — Measure (before any behaviour change)

1. In Supabase: break 9.4M into REST vs Auth vs Realtime vs Storage.
2. Rank RPCs: `save_activity_state`, `get_activity_state`, `ensure_learner_auth_link`, `mark_formative_response`, `resolve_learner_hub_access`.
3. Confirm whether the uncommitted Realtime SQL is on the hosted project.

### Phase 1 — Low risk, high impact (no scoring / schema / RLS changes)

0. **Confirm live Core ≥ 0.2.22** on every deployed hub (H8). If not, ship 0.2.23 first.
1. **Auth:** do not treat `TOKEN_REFRESHED` as a new login (H1).
2. **Unit 3:** run `recoverLearnerAfterAuthRestore` only when learner status is wrong (H4).
3. **Profile:** call `ensure_learner_auth_link` once per session unless identity error (H4).
4. **Week hydrate:** only the opened activity (H2).
5. **Unit 3 reconcile:** current week only (H3).
6. **Admin:** pause Group Generator when the tab is hidden (M1).
7. **T Level:** stop unscoped foundations triple-read (H7).
8. **Unit 14:** stop `submit_attempt` on Check (H6) — behaviour change for that hub’s official record timing; confirm with you first.

### Phase 2 — Draft-write coalescing (progress integrity first)

1. Keep **localStorage** writes immediate (already the case).
2. Increase **remote** debounce for in-progress text; flush on Check, Finish, hide, unload (C1).
3. Replace Unit 3 `immediate: true` carrier fan-out with a single-key debounced save (C2).
4. Remove duplicate Check listeners so one Check = one save + one `mark_formative_response` (H5).

### Phase 3 — Realtime (only after Phase 0 metric split)

1. If Realtime is a large share of 9.4M: subscribe lazily; disconnect when hidden (C3).
2. Do not enable server broadcast until revision/coalesce behaviour is on production and tested.
3. Never drop `save_activity_state` in favour of Realtime.

### Phase 4 — Admin read shaping (after learner traffic)

1. Deduplicate overlapping views.
2. Page attempts/responses; do not silently cap.

**Explicit non-goals for all phases:** do not remove progress recording, change RLS, change RPC contracts, change marks, or cache learner progress in a way that can show another learner’s work.

---

## 12. Expected request reduction

These are **order-of-magnitude**, not a guarantee. They assume Phase 0 confirms REST (not only Realtime) is most of the 9.4M.

| Phase | If the hypothesis holds | Rough reduction |
|---|---|---|
| Phase 1 | Duplicate boots and week fan-out are visible in logs | 10–25% |
| Phase 2 | `save_activity_state` dominates | **40–70%** of REST, without deleting required writes |
| Phase 3 | Realtime is inside 9.4M | **30–80% of that slice** by not holding channels in background |
| Combined | | Moving from ~9.4M toward low millions is plausible; sub-million needs metric proof |

If Phase 0 shows Realtime ≫ REST, do Phase 3 first and **do not** aggressively debounce saves (that would save little and risk drafts).

---

## 13. Risks and regression tests required

### Risks

- Longer remote debounce → lost drafts if `pagehide` does not fire (mobile). Keep local cache + flush on `visibilitychange` / `pagehide` / Check.
- Stopping carrier fan-out → week dashboard missing a host worksheet if the wrong key is chosen. Map each UI to one published key.
- Ignoring `TOKEN_REFRESHED` → must still update in-memory JWT so RPCs do not 401.
- Disconnecting Realtime → two tabs can overwrite; last-write-wins already exists via timestamps/revision.
- Admin pagination → UI that assumed a full `responses` dump must handle pages.

### Regression tests (exist or should be added before implementing)

Already present and must stay green:

- `learning-platform-core/tests/unit/activity-state-dedupe.test.js`
- `learning-platform-core/tests/unit/activity-state-identity-storm.test.js`
- `learning-platform-core/tests/unit/activity-state-sync.test.js`
- `learning-platform-core/tests/unit/stale-auth-session.test.js`
- Unit 3 `tests/remote-learner-work.test.js`, `tests/backend-progress.test.js`, `tests/check-does-not-submit-attempt.test.js`
- Formative marking tests (Check must still call `mark_formative_response`)
- Submission idempotency tests

Add before Phase 2:

- Typing 50 characters → **one or few** `save_activity_state`, not 50, and a `pagehide` flush still persists the last payload
- Unit 3 register edit → **one** activity key written per debounce, still restored on reload
- `TOKEN_REFRESHED` → **zero** extra `ensure_learner_auth_link` / `resolve_learner_hub_access`
- Week open → `get_activity_state` count equals opened activities, not the whole week
- Check still creates the same marking row and still does not call `submit_attempt` until Finish

Manual classroom checks: two browsers, same learner, same activity; complete an activity; tutor Results still show the attempt.

---

## Appendix — What was not found

- No learner `setInterval` hitting Supabase
- No React Query `refetchInterval` on learner hubs
- No evidence that `getSession()` (Core wrapper) is called per component for network Auth
- Admin `TOKEN_REFRESHED` does **not** reload modules (unlike learner Core)
- `loadAdminData()` (all 29 admin views) is tests-only, not the live portal path
- Identity retry storms are **already defended** in current Core; an old vendor `0.1.0` IIFE still exists in hubs but live apps depend on `@learning-platform/core` via package.json
- Admin dashboard does not poll while left open

---

Follow-up from [Audit core Supabase usage](fc89e556-3cfe-4600-bc4a-2c54bcd5e225), [Audit hub Supabase usage](5333dbcd-4a22-49b2-bd9a-e6f182c49c9a), and [Audit admin portal Supabase](8a45cd33-c7c1-4d10-833c-b60cdc24e0db) was merged into this document after the first draft.

---

## 14. Phase 1 remediation (2026-09-21)

Conservative only. Learner progress integrity was treated as more important than request reduction. Schema, RLS, RPC contracts, scoring, authentication architecture, curriculum `loadLatest` caching, Hub Learning filter RPCs, and Realtime were not changed.

### 14.1 Phase 1A — Core versions

How hubs consume Core: production Vite bundles `file:../learning-platform-core` from the **GitHub Pages CI checkout tag**, not from vendor IIFE (`0.1.0` / `0.2.0` are test/legacy only). Local `package.json` always points at the sibling Core checkout.

| Hub | Declared core version | Built / bundled core version | Expected production version | Status | Action required |
|---|---|---|---|---|---|
| T Level Software Development | `0.2.23` (`src/config.ts`) | CI clones `v0.2.23`; local `file:` now Core **0.2.24** source | `v0.2.23` | Production already has 0.2.22+ hydrate-storm and unchanged-write guards | Leave CI pin at `v0.2.23` until 0.2.24 is tagged |
| Unit 3 Cyber Security | **`0.2.23`** (was `0.2.21`) | CI now clones **`v0.2.23`**; local `file:` Core **0.2.24** | `v0.2.23` | Production was still **pre-0.2.22** (H8) | **Done:** Pages pin, hub config, manifest, and tests updated to 0.2.23 |
| Unit 14 SEB | `0.2.8` | CI clones `v0.2.8`; local `file:` current Core | `v0.2.8` | Could still serve pre-0.2.22 hydrate-storm behaviour | Do **not** auto-upgrade; hub-specific review before jumping 0.2.8 → 0.2.23+ |
| L2E / Emerging Digital Technologies | `0.2.20` | CI clones `v0.2.20` | `v0.2.20` | Pre-0.2.22 | Do not auto-upgrade in Phase 1 |
| Year 1 Readiness | `0.2.5` | CI clones `v0.2.5` | `v0.2.5` | Pre-0.2.22; auth off | Do not auto-upgrade in Phase 1 |

Workspace learner hubs are Unit 3 and T Level. Sibling hub folders on disk were inspected for the table above. Vendor IIFE is not the production bundle.

Core source was bumped to **0.2.24** for visibility flush + assignment snapshot reuse. That tag is not cut yet, so production pins stay on existing reviewed tags (`v0.2.23` for Unit 3 and T Level).

### 14.2 Changes made

**1B `save_activity_state`**

- Unchanged persistable payloads already skipped the RPC in Core 0.2.22+ (`persistableActivityStateFingerprint`). Kept.
- Pending remote saves now also flush on `document.visibilitychange` (hidden), in addition to `pagehide` / `beforeunload`.
- Failed saves remain retryable (fingerprint is cleared on error). Check / Finish still use `immediate: true` where they already did.
- Typing still debounces at 600ms; 50 rapid `save()` calls produce **one** RPC.

**1C Unit 3 carrier writes**

- `updateActivity` and `setDraft` still persist onto **both** published host carriers (compatibility not removed).
- Those two wraps plus typing no longer call `save(..., { immediate: true })` per keystroke.
- Patches for the same week are coalesced for 600ms, then written once per carrier with `immediate: true`.
- `pagehide` / hidden tab flush the pending week queue so drafts are not left only in memory.

**1D Unit 14 `submit_attempt`**

- Check / `lp-block-result` persist activity state only (`immediate: true`).
- `submitActivityDraft` (`submit_attempt`) runs from **Finish activity**, matching T Level.
- Scoring / `mark_formative_response` paths were not changed.

**1E T Level Foundations bootstrap**

- Landing `studentProgress()` no longer calls `getAttempts` (unused by the landing UI).
- `my_hub_assignments` is reused from the boot snapshot (`getCachedHubAssignments`) when present.
- `getProgress()` still runs so completed scores are not served from stale boot data.

### 14.3 Files changed

- `learning-platform-core`: `package.json`, `CHANGELOG.md`, `docs/public-api.md`, `src/core/progress/activity-state.js`, `src/core/assignment/assignment-service.js`, `src/platform.js`, `dist/*` (rebuild)
- `unit-3-Cyber-Security-Hub`: `.github/workflows/pages.yml`, `src/config.ts`, `js/config/app-config.js`, `learning-platform-hub.json`, `js/core/remote-learner-work.js`, related tests
- `tlevel-software-development-hub`: `js/core/supabase-analytics.js`, `test/supabase-frontend-migration.test.js`
- `unit-14-software-engineering-for-business-hub`: `content/engine/interactive.js`, `test/check-does-not-submit-attempt.test.js`

### 14.4 Tests added

- Core: unchanged-write + typing coalesce + visibility flush (`tests/unit/activity-state-dedupe.test.js`); assignment snapshot (`tests/unit/assignment-service.test.js`)
- Unit 3: carrier coalesce, rapid identical notes, reload restore of drafts/completed extras, pagehide flush (`tests/remote-learner-work.test.js`)
- T Level: boot assignment reuse; no `getAttempts` on landing analytics
- Unit 14: Check does not submit; Finish submits once; last-question Check does not submit

### 14.5 Before / after request counts (code-path justified)

Counts are **Supabase RPCs for that learner action**, not a measured production sample.

| Action | Before | After |
|---|---|---|
| Open week (Unit 3 **production** was Core 0.2.21) | `get_activity_state` × activities × WeekPage re-renders (H8 storm) | `get_activity_state` × activities **once per JS session** after pinning `v0.2.23` |
| Open week (T Level already 0.2.23) | already once per activity / session | unchanged |
| Edit Unit 3 host worksheet / note (one logical edit, both carriers required) | up to **4** `save_activity_state` (updateActivity + setDraft × 2 keys, `immediate`) | **2** `save_activity_state` after 600ms coalesce (one per carrier). Identical payload then skipped by Core fingerprint |
| Edit T Level / catalogue text (debounced) | **1** `save_activity_state` per 600ms pause | **1** per pause; **0** if persistable state unchanged; hidden-tab flush still writes dirty state |
| Check answer (T Level / Unit 3 catalogue) | **1** `save_activity_state` immediate; no `submit_attempt` | unchanged |
| Check answer (Unit 14, evidence complete) | **1** `save_activity_state` + **1** `submit_attempt` | **1** `save_activity_state`, **0** `submit_attempt` |
| Finish activity (Unit 14) | often **0** extra `submit_attempt` (already sent on last Check) | **1** `save_activity_state` immediate + **1** `submit_attempt` at Finish |
| Foundations landing bootstrap (signed-in, after hub ready) | **3** (`getProgress` + `getAttempts` + `my_hub_assignments`) | **1** (`getProgress`); assignments reused from boot |

Do not treat these as a percentage of 9.4M. Realtime heartbeats, boot identity RPCs, curriculum `loadLatest`, and week fan-out still exist.

### 14.6 Remaining high-volume paths (Phase 2)

Addressed in §15. At Phase 1 close these were still open:

- Auth `TOKEN_REFRESHED` re-running learner bootstrap
- Curriculum `published_curriculum_package` on every `loadLatest()` (not cache-first)
- Week-open hydrate of every activity; Unit 3 `backend-progress.js` hydrating weeks 2–7 carriers
- Realtime `learner-state:{uid}` heartbeats (if counted in 9.4M)
- Admin Group Generator 2.5s poller; Hub Learning dual filter RPCs
- Unit 14 / L2E / Readiness still on pre-0.2.22 Core in production CI

### 14.7 Risks

- Unit 3 still writes **two** carrier keys per coalesced edit. Removing a carrier would risk restore of older notes; not done.
- Hub coalesce is 600ms. If `pagehide` and `visibilitychange` both fail (some mobile kills), the last 600ms of unflushed remote state could be lost. Local `localStorage` is still written immediately by week engines.
- Unit 14 learners now need **Finish activity** before an official attempt exists. Check still stores drafts. This is the intended T Level lifecycle, but it is a Unit 14 record-timing change.
- Assignment snapshot can be stale until the next boot/refresh if a tutor assigns during the same tab session. Progress scores still refresh via `getProgress`.
- Core 0.2.24 visibility flush is in local source/dist only until tagged and re-pinned.

### 14.8 Recommended Phase 2 work

1. Confirm REST vs Realtime vs Auth share of the 9.4M in project API reports.
2. Stop full learner bootstrap on `TOKEN_REFRESHED` while still rotating the in-memory JWT.
3. Cache-first `loadLatest` with explicit invalidation.
4. Hydrate the opened activity (or visible week slice), not every week 2–7 carrier on script load.
5. Review Unit 14 / L2E / Readiness Core pins separately; do not mass-upgrade.
6. Realtime: subscribe lazily / disconnect when hidden if heartbeats dominate.

### 14.9 Test run

- `learning-platform-core`: **250 passed**
- T Level hub `npm test`: **passed** (node 101, vitest 13 files, post-build)
- Unit 14 hub `npm test`: **passed** (node 79, vitest 10 files, post-build)
- Unit 3 hub: node persistence/version tests **passed**; vitest **220 passed / 1 failed** — `src/catalogue/week5-defensive.test.tsx` classification retry UI (`data-lp-feedback-state='correct'`). That test does not use the Phase 1 persist/RPC paths and was not modified.

*Phase 1 applied. Phase 2 items above remain untouched.*

---

## 15. Phase 2 remediation (2026-09-21)

Conservative remaining-read, bootstrap, and background reduction. Phase 1 persistence guarantees were not undone: Unit 3 still writes both host carriers; Check/Finish remain immediate; failed saves still retry; Unit 3 compatibility keys remain; scoring, completion, RLS, schema, and authentication security were not changed. Realtime was inventoried and leak-checked, not removed. Further write coalescing was not started.

Core source is **0.2.25** (untagged). Production CI pins stay on reviewed tags (`v0.2.23` for Unit 3 and T Level) until 0.2.25 is tagged and re-pinned.

### 15.1 2A — Pre-0.2.22 Core hubs

None of these hubs were upgraded. Version consistency was not treated as a reason to ship.

| Hub | Pin | Week/activity hydrate? | Can re-renders repeat `get_activity_state`? | Classification | Why |
|---|---|---|---|---|---|
| Unit 14 SEB | **0.2.8** | Yes. `WeekPage` hydrates every activity on the week, then interactive rebind hydrates again | **Yes** on pre-0.2.22 Core | **HIGH RISK / DEFER** | Benefit is real (0.2.22 interned `completedReads`), but 0.2.8 → 0.2.23 includes hub-scoped auth (0.2.13), hub access (0.2.12), in-progress activity state (0.2.10), `getUser()` restore (0.2.20), fill-gap evidence identity (0.2.21), Realtime (0.2.22), and identity circuit-breaking (0.2.23). That can change auth, persistence, scoring evidence, and completion restore. Needs a dedicated hub QA pass, not a traffic pin bump. |
| L2E / EDT | **0.2.20** | Yes. Same `WeekPage` hydrate-all as T Level | **Yes** on 0.2.20 | **UPGRADE WITH CHANGES** | Already has 0.2.20 `getUser()` restore. The missing win is 0.2.22 hydrate dedupe. **Do not ship yet:** L2E has fill-gap blocks, and 0.2.21 changed formative evidence identity (`questionId` vs `questionId:gapId`). That is a marking/scoring contract change. Upgrade only with fill-gap regression coverage on this hub. |
| Year 1 Readiness | **0.2.5** | No week hydrate. `features.authentication` / `progress` are off | **No** | **NO BENEFIT** | Diagnostic RPCs only. The 0.2.22 hydrate storm does not apply. Jumping 0.2.5 → 0.2.23 would still pull hub-scoped auth and onboarding changes for a hub that does not sign learners in. |

**Upgraded:** none.  
**Deliberately not upgraded:** all three, for the reasons above.

API delta (pinned version → 0.2.23) that would affect behaviour if they were upgraded:

- Unit 14 0.2.8 → 0.2.23: activity-state persistence, hub access, hub-scoped Auth, onboarding security, `getUser()` stale recovery, fill-gap evidence, hydrate dedupe, Realtime, identity circuit breaker.
- L2E 0.2.20 → 0.2.23: fill-gap evidence (0.2.21), hydrate/Realtime/skip-unchanged-save (0.2.22), identity circuit breaker (0.2.23).
- Readiness 0.2.5 → 0.2.23: essentially the entire modern learner stack; unused while auth/progress are off.

### 15.2 2B — TOKEN_REFRESHED / Auth bootstrap

**What TOKEN_REFRESHED caused before**

Core `onAuthStateChange` treated every session event with a JWT as a new `authenticated` publish. Downstream:

| Path | TOKEN_REFRESHED before | Notes |
|---|---|---|
| Curriculum reload | **0** | `loadLatest()` is hub-boot, not auth-event driven |
| Assignments reload | **1** `my_hub_assignments` | Platform learner subscriber |
| Progress reload | **0** in Core; **1** `my_activity_progress` on Unit 3 pages that load `backend-progress.js` | Auth notify → `SupabaseAuth.subscribe` → `reconcile()` |
| Activity-state hydration | **0** extra RPCs in Core (channel reused); Unit 3 could re-enter week 2–7 `hydrateWeekRoot` | Core `completedReads` already skipped the RPC after the first hydrate |
| Admin data reload | **0** | Admin `shouldBootstrapAdminData("TOKEN_REFRESHED")` was already false |
| Other RPC/database reads | **3** (`ensure_learner_auth_link`, `my_profile`, `my_enrolments`) + **1** `resolve_learner_hub_access` | Learner context refresh |

**TOKEN_REFRESHED before: 5 application Supabase requests** (ensure + profile + enrolments + hub access + assignments).  
Unit 3 pages with `backend-progress.js` added **1** more (`getProgress`). Auth SDK token refresh itself is not an application data request and was not suppressed.

**Change**

- Same Auth user + already `authenticated`: `TOKEN_REFRESHED`, repeated `INITIAL_SESSION`, same-user `SIGNED_IN`, and `USER_UPDATED` update `state.session` (JWT) and call Realtime `setAuth` **without notifying application listeners**.
- `SIGNED_IN` for a different user still publishes and bootstraps.
- Logout / login still bootstraps (signed-out clears learner context).
- Expired / `SIGNED_OUT` still signs out.
- Explicit `learner.refresh()` and `refreshHubSession()` still reload data.
- Learner context also ignores a same-user `authenticated` republish if one still occurs.

**TOKEN_REFRESHED after: 0 application Supabase requests**

| Action | Application REST before | After |
|---|---|---|
| Initial login / `SIGNED_IN` new session | ~5 | ~5 (unchanged) |
| Page refresh (`initialise` + `getUser`) | ~5 + Auth `getUser` | same; extra `INITIAL_SESSION` no longer repeats the 5 |
| Token refresh | **5** (+ Unit 3 `getProgress`) | **0** |
| Logout then login | ~5 | ~5 |
| Switch users | ~5 | ~5 |
| Expired session | 0 data reads; local sign-out | unchanged |

**Behaviour preserved:** JWT still rotates; RLS still uses the live SDK session; Realtime auth is refreshed; stale-session `getUser()` on first restore is unchanged.

**Tests:** `tests/unit/auth-bootstrap-events.test.js` (login, refresh, token refresh, logout/login, user switch, expired session). Existing stale-session tests remain.

### 15.3 2C — Curriculum `loadLatest()`

**Before:** every `loadLatest()` called `api.published_curriculum_package`. `localStorage` was error/offline fallback only. No TTL, but also no version check.

**After (version-aware, no invented TTL):**

| Situation | Requests |
|---|---|
| First visit, empty cache | **1** `published_curriculum_package` (same as before; metadata skipped so first load is not doubled) |
| Same JS session `loadLatest()` again | **0** (in-memory published package) |
| New JS session / new tab, cache valid, `package_version` unchanged | **1** `published_curriculum` metadata, **0** package |
| Educator published a new `package_version` | **1** metadata + **1** package |
| `curriculum.refresh()`, version unchanged | **1** metadata |
| Offline / RPC error with valid cache | **0**; source `cache`, state `FALLBACK` (unchanged) |

**REQUESTS REMOVED:** 1 full package RPC per extra `loadLatest()` in a session; 1 full package RPC per later hub open when the published version is unchanged (replaced by a metadata RPC with no package body).

**Never cached as curriculum:** learner progress, attempts, activity-state drafts. Cache keys remain `lp.curriculum.cache.v1:{hubCode}:{courseKey}`. Invalid JSON or a payload without `hub`+`curriculum` is rejected and the live package is fetched.

**How a newly published curriculum reaches learners**

1. Staff publish a new immutable `package_version` in Central Admin.
2. `api.published_curriculum` returns that version for the hub/course.
3. A new JS session `loadLatest()`, or `curriculum.refresh()`, sees the mismatch and downloads `published_curriculum_package`.
4. An already-open tab keeps the package from its first successful load so React remounts do not repeat the full RPC. Reload or `refresh()` picks up the new version.

**Tests:** `tests/unit/curriculum-runtime.test.js` (same-session reuse, metadata hit, new version fetch, progress-shaped cache rejected, offline fallback).

### 15.4 2D — Hub Learning filter RPCs

**Traced**

- RPCs: `list_hub_learning_result_filters` (once per hub), then on every filter change `list_hub_learning_results` **and** `summarise_hub_learning_results` with the same params. First open also re-fired the pair when filter option rows arrived (`cascaded` identity).
- Datasets: current class membership + current activity assignments for **one hub**. Filters: course, group, learner, week, session, activity, completion status.
- Server query semantics: params only narrow that hub-scoped current-work grid. They do not change RLS. The empty-filter open already returns the complete grid the UI can show.
- Demo mode already filtered that in-memory grid.

**Change:** live mode loads `list_hub_learning_results` **once** for the hub (empty filters). View filters and the summary cards are computed client-side from those rows. Evidence still uses `list_hub_learning_result_evidence` when a row is opened. No extra learners/hubs are fetched.

| Action | Before | After |
|---|---|---|
| Initial Hub Learning load | **~5** (1 filters + 2 results/summary, then 2 again) | **2** (1 filters + 1 results) |
| Each filter change | **2** | **0** |

**REQUESTS REMOVED:** 3 on first open; 2 per subsequent filter change.

**Behaviour preserved:** same hub-scoped dataset, same cascade of invalid downstream selections, same Open-row evidence RPC. RLS unchanged.

**Tests:** `learning-platform-admin/tests/results-hub.test.ts` (local filter/summary; page no longer calls `summarise_hub_learning_results`).

### 15.5 2E — Realtime inventory

Searched learner hubs, Core, Admin, and Reports for `channel(`, `postgres_changes`, and Realtime subscribe.

| Hub / component | Channel | Table / event | Created | Destroyed | Per browser tab | Duplicate possible? | UI feature | Polling too? | Class |
|---|---|---|---|---|---|---|---|---|---|---|
| Core `activity-state-sync` via `createPlatform()` | private `learner-state:{auth uid}` | Broadcast `activity_state_invalidated` (not a table replica) | Auth status `authenticated` | `stop()` / `reset()` on sign-out and `platform.destroy()` | **1** | `start()` reuses the channel for the same user; second `start()` only `setAuth`s | Cross-tab / reconnect in-progress draft refresh | No for this data | **REQUIRED REALTIME** for two-tab/device restore. **COULD USE MANUAL REFRESH** for single-tab classrooms. Not removed. |
| Admin portal | none | — | — | — | 0 | — | — | Group Generator `get_grouping_session` every 2.5s (not Realtime) | Poller is **COULD USE MANUAL REFRESH** / hidden-tab pause (left for later; not Phase 2) |
| Hub Learning / Analytics / Reports | none | — | — | — | 0 | — | — | No | — |
| Unit 3 / T Level host scripts | none extra | — | — | — | 0 beyond Core | — | — | No | — |

Server broadcast SQL `20260912120000_activity_state_revision_realtime.sql` is still **uncommitted**. The client still subscribes even if the server never sends. That is not a leak; it is an idle private channel + heartbeats.

**Cleanup verified:** `platform.destroy()` and sign-out call `activityStateSync.reset()`. `start()` twice for the same user does not create a second channel (`tests/unit/activity-state-sync.test.js`). No duplicate/leaked subscription was demonstrated, so none was rewritten. TOKEN_REFRESHED no longer calls `start()`; Auth quietly calls `realtime.setAuth()` instead.

**Amplification (Realtime connections / subscriptions, distinct from PostgREST/RPC):**

| Population | Subscriptions | Notes |
|---|---|---|
| 30 learners, one hub, one tab | 30 channels | One private topic each while signed in |
| 180 learners, one hub, one tab | 180 | Only if all 180 have a hub tab open |
| 30 learners × 2 hubs | 60 | Per-hub Core client / Auth storage key |
| Multiple admin tabs | 0 Realtime | Group Generator poll is REST, ~1,440 req/hour/tab if left open |

Heartbeat frames are **not** PostgREST/RPC. Whether they sit inside the 9.4M figure is still unconfirmed (Phase 0).

### 15.6 2F — Remaining week 2–7 carrier hydrates

**Trace (Unit 3 `backend-progress.js` + `remote-learner-work.js`)**

- On script load: `LearningPlatform.ready.then(reconcile)` **and** `SupabaseAuth.subscribe(authenticated → reconcile)`.
- Each `reconcile()`: **1** unscoped `getProgress()` (`my_activity_progress`) + `hydrateWeekRoot` for weeks **2–7**.
- Each week has **2** published host carriers → **12** `store.hydrate()` → up to **12** `get_activity_state` on the **first** pass.
- `hydrateWork` uses Core `createStore().hydrate()`. After Core 0.2.22, a second hydrate of the same carrier in the same JS session is interned (`completedReads`) and does **not** RPC.
- Hydration is **per script-load reconcile**, not per activity render. WeekPage catalogue hydrates are a separate remaining fan-out (opened week, once per session on 0.2.22+).

**Demonstrated duplicate:** first page load ran reconcile twice (ready + authenticated notify). TOKEN_REFRESHED could run it again (1 extra `getProgress`; hydrates RPC-free after the first pass).

**Change:** skip `getProgress` + carrier hydrates when this Auth user already reconciled in this JS session. `markSubmitted` still forces a progress refresh. First-load weeks 2–7 hydrates were **not** removed (a local copy is not treated as proof that server state is unnecessary).

| Action | Before | After |
|---|---|---|
| Unit 3 page with `backend-progress.js`, first signed-in load | **2** `getProgress` + **12** hydrates (second hydrate RPC-free on 0.2.23) | **1** `getProgress` + **12** first hydrates |
| TOKEN_REFRESHED on that page | **1** `getProgress` (+ 12 no-op hydrates) | **0** (2B + 2F) |
| Later week render of the same carriers | **0** extra RPCs (Core `completedReads`) | unchanged |

**Remaining duplicate-looking hydrates (not removed):** WeekPage still hydrates every activity on the opened week once per JS session. That is first-use restore, not a repeated hydrate of the same carrier.

**Tests:** `tests/backend-progress.test.js` (ready + authenticated coalesce to one `getProgress`; explicit `reconcile()` skipped; `{ force: true }` refetches).

### 15.7 Files changed

- `learning-platform-core`: `src/core/auth/auth-service.js`, `src/core/learner/learner-context.js`, `src/curriculum-runtime/published-curriculum-service.js`, `package.json` **0.2.25**, `CHANGELOG.md`, `docs/public-api.md`, `docs/curriculum-runtime.md`, tests, `dist/*` rebuild
- `unit-3-Cyber-Security-Hub`: `js/core/backend-progress.js`, `tests/backend-progress.test.js`
- `learning-platform-admin`: `src/results/hub-learning.ts`, `src/views/hub-learning-results.tsx`, `tests/results-hub.test.ts`

### 15.8 Phase 2 request table

Counts are **code-path RPCs for that action**, not a measured share of 9.4M.

| Request source | Phase 1 state | Phase 2 state | Before requests | After requests | Estimated significance |
|---|---|---|---|---|---|
| Unit 3 host-work `save_activity_state` | 2 writes/edit, both carriers | unchanged | 2 | 2 | Still the hottest REST write during typing |
| Check / Finish saves | Immediate; failed retry | unchanged | 1 | 1 | Required |
| Unit 14 Check `submit_attempt` | Removed in Phase 1 | unchanged | 0 | 0 | — |
| Foundations landing reads | 1 `getProgress` | unchanged | 1 | 1 | Low |
| TOKEN_REFRESHED application REST | Full learner bootstrap | JWT + Realtime `setAuth` only | **5** (+1 Unit 3 progress) | **0** | High combined with many boots / hourly refresh |
| Curriculum `loadLatest` success | Always full package RPC | Version-aware cache; same-session memory | **1** package | **0**–**1** metadata, package only on miss/change | Medium per hub open |
| Hub Learning initial load | ~5 RPCs | 2 RPCs | ~5 | **2** | Admin-only, bursty |
| Hub Learning each filter | 2 RPCs | 0 | **2** | **0** | Admin-only |
| Realtime `learner-state:{uid}` | 1 channel / signed-in tab | Inventory only; TOKEN_REFRESHED no longer re-`start()`s | 1 subscription | 1 | Metric-dependent if heartbeats count |
| Unit 3 weeks 2–7 first hydrate | 12 `get_activity_state` + duplicate `getProgress` | 12 hydrates once; 1 `getProgress` | 2 progress + 12 hydrates | **1** progress + **12** hydrates | Burst on Unit 3 page load |
| WeekPage hydrate-all | Once per session on 0.2.23 | unchanged (not a duplicate) | N activities | N | Burst on week open |
| Pre-0.2.22 hub re-render storm | Unit 3/T Level pinned 0.2.23; others old | Unit 14 / L2E / Readiness **not** upgraded | O(activities × renders) on those hubs | unchanged on those hubs | High **if** those hubs are in live classroom use |

### 15.9 Summary answers

1. **Old Core hubs upgraded:** none.
2. **Not upgraded:** Unit 14 (HIGH RISK / DEFER), L2E/EDT (UPGRADE WITH CHANGES — fill-gap 0.2.21), Year 1 Readiness (NO BENEFIT).
3. **TOKEN_REFRESHED:** 5 application REST → **0**. Auth refresh itself kept.
4. **Curriculum:** full package RPC every `loadLatest` → same-session 0; later sessions 1 metadata when version unchanged; full package only on first download or new `package_version`.
5. **Hub Learning filters:** initial ~5 → 2; each filter 2 → **0**.
6. **Realtime:** one required private learner channel per signed-in hub tab; no duplicate/leak found; Admin has no Realtime (Group Generator still polls); server broadcast SQL still uncommitted.
7. **Remaining hydrates:** WeekPage still hydrates every activity on the opened week once; Unit 3 still hydrates 12 week 2–7 carriers **once** per JS session. Repeated reconcile / token-refresh hydrates removed.
8. **Tests:** Core **260 passed** (was 250; +10 Phase 2). T Level `npm test` **passed**. Unit 3 `test:node` **passed** (includes persistence, version pin 0.2.23, duplicate reconcile). Admin `results-hub.test.ts` **passed**. Unit 3 vitest week5-defensive classification retry UI failure is **unchanged** and is not from this work. Unit 14 was not modified in Phase 2.
9. **Remaining risks:** production still ships Core **0.2.23** until 0.2.25 is tagged, so TOKEN_REFRESHED bootstrap and curriculum cache-first are local/source until re-pin. Same-tab learners do not see a newly published curriculum until reload/`refresh()`. Hub Learning summaries now match the loaded grid (same as demo); if a future server summary diverged from listed rows, the UI would follow the grid. Unit 14/L2E can still hydrate-storm in production. Assignment snapshot can still be stale until the next real bootstrap.
10. **What is now most likely to dominate Supabase traffic:** **draft `save_activity_state` during lessons** (still 600ms debounce; Unit 3 still 2 carrier writes per coalesced edit), then **Realtime heartbeats if they are inside the 9.4M figure**, then **week-open `get_activity_state` fan-out** and **MPA/full-load bootstrap** (no longer multiplied by hourly token refresh). Confirm REST vs Realtime vs Auth in project API reports before further write coalescing or Realtime teardown.

Do not calculate a percentage of 9.4M. These are path counts, not dashboard samples.

*Phase 2 applied. Stop. Do not begin schema/RLS redesign or further write coalescing.*

---

## 16. Phase 3 — Release, validation, and measurement (2026-09-21)

Objective: ship Core **0.2.25**, pin only proven-compatible hubs, instrument logical operations, and define what “normal” means empirically. **No further optimisation.** Production measurements come first.

`0.2.24` was a local intermediate (visibility flush + assignment snapshot) and was **never tagged**. Tag **`v0.2.25`** includes 0.2.24 fixes plus Phase 2 bootstrap/curriculum changes and Phase 3 counters.

### 16.1 3A — Pre-release validation

**Diff vs production tag `v0.2.23` (source only, excluding `dist/` rebuilds):**

| Area | Files | Accidental? |
|---|---|---|
| Auth silent JWT rotate | `src/core/auth/auth-service.js`, `src/core/learner/learner-context.js` | No — Phase 2B |
| Curriculum cache-first | `src/curriculum-runtime/published-curriculum-service.js`, docs | No — Phase 2C |
| Assignment snapshot | `src/core/assignment/assignment-service.js`, `src/platform.js` | No — Phase 1 |
| Visibility flush | `src/core/progress/activity-state.js` | No — Phase 1 |
| Request counters | `src/core/logging/request-counter.js`, `learner-api.js`, `auth-service.js`, `activity-state-sync.js`, `src/advanced.js` | No — Phase 3D |
| Tests / changelog / version | `tests/**`, `CHANGELOG.md`, `package.json` **0.2.25** | No |
| Unrelated product features | — | **None found** |

Not included: `supabase/.temp/linked-project.json` (local CLI link; not part of the release).

**Version metadata:** `package.json` **0.2.25**; changelog **0.2.25** (with untagged 0.2.24 notes folded in); `npm pack --dry-run` reports `@learning-platform/core@0.2.25`. Counters are **advanced** exports, not a stable public API change.

**Core tests:** `npm run check` — **267 passed** (was 260 after Phase 2; +7 counters/scenarios/assignment snapshot).

**Hub regression (against local Core 0.2.25, hubs still declaring 0.2.23 until 3B):**

| Check | T Level | Unit 3 |
|---|---|---|
| `npm test` / `test:node` | **passed** (includes Vite build) | `test:node` **passed** |
| login / logout / refresh paths | covered by Core auth bootstrap tests + hub platform tests | same + persistence tests |
| TOKEN_REFRESHED | Core scenario D: 0 application REST; Realtime `setAuth` only | Unit 3 duplicate reconcile skipped for same Auth user |
| progress / activity restore | Core hydrate intern + T Level analytics reuse boot assignments | dual carriers preserved; duplicate reconcile removed |
| Check / Finish / failed-save retry | Core scenario B/C + existing persist tests | existing persist tests; carriers still both written |
| curriculum / assignments | scenario A/E; cache-first | same Core path |
| Realtime reconnect/auth | `setAuth` on quiet rotate; one private channel; `destroy`/sign-out reset | unchanged contract |
| Unit 3 dual carriers | n/a | still 2 keys per coalesced edit (600ms); not removed |

**STOP condition:** no regression found. Unrelated Unit 3 vitest `week5-defensive` classification retry UI failure is unchanged and is not from this work.

### 16.2 3B — Release Core 0.2.25

Existing process (README + 0.2.23 precedent): quality workflow, changelog, `dist/` build, PR to `main`, tag `v0.2.25` on the merge commit, GitHub Release. No history rewrite, no force-push, no new release mechanism.

| Item | Value |
|---|---|
| Validation | **passed** |
| Tagged | **yes** — [`v0.2.25`](https://github.com/Acerosa/learning-platform-core/releases/tag/v0.2.25) on merge `1d7cd87` ([PR #30](https://github.com/Acerosa/learning-platform-core/pull/30)) |
| Hubs moved | **T Level** ([PR #53](https://github.com/Acerosa/tlevel-software-development-hub/pull/53), `9d2fda6`), **Unit 3** ([PR #93](https://github.com/Acerosa/unit-3-Cyber-Security-Hub/pull/93), `f8eec16`) |
| Not moved | Unit 14, L2E/EDT, Year 1 Readiness (Phase 2 decisions stand) |

### 16.3 3C — Deployment verification

`package.json` / `coreVersion` is **not** sufficient. CI cloned `ref: v0.2.25`, Vite production bundles contain `AUTH_BOOTSTRAP` (0.2.25-only counter), `getCachedHubAssignments`, `TOKEN_REFRESHED`, and `published_curriculum`. GitHub Pages deploys for both pin PRs **succeeded**.

| Hub | Declared version | CI version | Resolved/built version | Expected production version |
|---|---|---|---|---|
| T Level Software Development | `0.2.25` (`src/config.ts`, `js/config/app-config.js`, `learning-platform-hub.json`) | Pages `ref: v0.2.25` | Live `assets/main-CVTVJHIU.js` contains `AUTH_BOOTSTRAP` (×3), `getCachedHubAssignments`; local `file:` Core **0.2.25** | **0.2.25** (live) |
| Unit 3 Cyber Security | `0.2.25` (same three manifests) | Pages `ref: v0.2.25` | Live `assets/main-B20YSmG6.js` contains `AUTH_BOOTSTRAP` (×3), `getCachedHubAssignments`; local `file:` Core **0.2.25** | **0.2.25** (live) |
| Unit 14 SEB | `0.2.8` | `v0.2.8` | not rebuilt for this phase | **0.2.8** (unchanged) |
| L2E / EDT | `0.2.20` | `v0.2.20` | not rebuilt for this phase | **0.2.20** (unchanged) |
| Year 1 Readiness | `0.2.5` | `v0.2.5` | not rebuilt for this phase | **0.2.5** (unchanged) |

All four columns agree for T Level and Unit 3: **0.2.25**.

### 16.4 3D — Request instrumentation

Existing Core logging redacts secrets but does not categorise RPCs. Phase 3 adds **in-memory logical counters** that do not change request behaviour.

- Module: `src/core/logging/request-counter.js`
- Advanced exports: `REQUEST_CATEGORIES`, `recordPlatformRequest`, `snapshotPlatformRequests`, `resetPlatformRequests`, `enablePlatformRequestDebug`, `disablePlatformRequestDebug`
- Wired at: learner `read`/`rpc`; Auth `getUser` / `signIn` / `signOut` / `refreshSession`; Realtime `setAuth` / `channel.subscribe`
- Debug logging **off by default**. Enabling a sink still receives `{ category, operation, kind }` only.
- **Never stored:** JWTs, access tokens, learner identity, answers, evidence, or payloads.
- Operation-name cap: 500 entries (counts continue).

| Category | Typical operations |
|---|---|
| AUTH_BOOTSTRAP | `getUser`, `signIn`, `signOut`, `refreshSession`, `ensure_learner_auth_link`, `my_profile`, `my_enrolments`, `resolve_learner_hub_access`, onboarding/join |
| CURRICULUM | `published_curriculum`, `published_curriculum_package` |
| ASSIGNMENTS | `my_hub_assignments`, `my_assignments`, `my_activity_delivery` |
| GET_ACTIVITY_STATE | `get_activity_state` |
| SAVE_ACTIVITY_STATE | `save_activity_state`, `clear_activity_state` |
| SUBMIT_ATTEMPT | `submit_attempt` |
| PROGRESS | `my_activity_progress`, `my_attempts`, `my_responses`, `mark_formative_response` |
| REALTIME | `setAuth`, `channel.subscribe`, `channel.unsubscribe` |
| ADMIN | `list_hub_learning_*`, `summarise_hub_learning_*`, `admin_api.*`, grouping session |
| OTHER | unmatched names |

Hubs can snapshot via `@learning-platform/core/advanced` in development. Production behaviour is unchanged if the snapshot API is unused.

These counters **do not** include Auth SDK `getSession()`, Realtime WebSocket heartbeats, or raw `fetch` outside Core. Compare them to Supabase dashboard series, not as a substitute.

### 16.5 3E — Baseline scenarios (what NORMAL means)

Reproducible Core path: `tests/unit/request-baseline-scenarios.test.js` (fake Supabase). Counts are **logical Core operations**, not live project traffic and not WebSocket frames.

Hub overlays (not inside the fake Core harness) are noted under each scenario.

#### SCENARIO A — Login → open hub → open one 5-activity week

| Category | Core count | Notes |
|---|---|---|
| AUTH_BOOTSTRAP | **5** | `getUser`, `ensure_learner_auth_link`, `my_profile`, `my_enrolments`, `resolve_learner_hub_access` |
| ASSIGNMENTS | **1** | `my_hub_assignments` |
| CURRICULUM | **1** | first session: `published_curriculum_package` (no prior cache) |
| GET_ACTIVITY_STATE | **5** | one hydrate per activity on the opened week |
| SAVE_ACTIVITY_STATE | 0 | |
| SUBMIT_ATTEMPT | 0 | |
| PROGRESS | 0 | Core boot does not `getProgress` |
| REALTIME | **≥1** | `setAuth` + `channel.subscribe` when a channel stub exists |
| ADMIN | 0 | |

**Hub overlay:** T Level WeekPage hydrates every activity on the opened week (N, not always 5). Unit 3 first signed-in page that loads `backend-progress.js` still adds **1** `PROGRESS` (`my_activity_progress`) + **12** `GET_ACTIVITY_STATE` (week 2–7 carriers, once per JS session). Duplicate reconcile on the same Auth user is 0 extra.

#### SCENARIO B — Open activity → edit → pause → edit → Check → next activity

Measured after boot (counters reset). Debounce 20ms in the test stand-in for production 600ms.

| Category | Core count | Notes |
|---|---|---|
| GET_ACTIVITY_STATE | **2** | open activity + next activity |
| SAVE_ACTIVITY_STATE | **3** | debounced edit, debounced edit after pause, immediate Check |
| SUBMIT_ATTEMPT | **0** | Check is not Finish |
| AUTH_BOOTSTRAP | **0** | |

**Hub overlay:** Unit 3 host worksheets still write **two** carrier keys per coalesced burst (Phase 2: 4→2, not 2→1). T Level single `createStore` matches the table.

#### SCENARIO C — Complete an activity → Finish

| Category | Core count | Notes |
|---|---|---|
| GET_ACTIVITY_STATE | **1** | |
| SAVE_ACTIVITY_STATE | **1** | immediate persist of checked draft |
| SUBMIT_ATTEMPT | **1** | official attempt only |

Failed-save retry remains a later `save_activity_state` of the same persistable payload (not in this happy-path count).

#### SCENARIO D — Authenticated hub left open through TOKEN_REFRESHED

| Category | Core count | Notes |
|---|---|---|
| AUTH_BOOTSTRAP | **0** | no profile / enrolment / hub-access replay |
| ASSIGNMENTS | **0** | |
| CURRICULUM | **0** | |
| GET_ACTIVITY_STATE | **0** | |
| PROGRESS | **0** | |
| REALTIME | **1** | `setAuth` only |

Auth token rotation itself (GoTrue refresh) still happens in the SDK and will appear in **Auth** dashboard traffic. It is not an application REST bootstrap.

#### SCENARIO E — Reload with unchanged curriculum

New JS session, same `localStorage` cache, same `package_version`.

| Category | Core count | Notes |
|---|---|---|
| CURRICULUM | **1** | `published_curriculum` metadata only |
| published_curriculum_package | **0** | |

First-ever download or a new `package_version` still runs the full package RPC.

#### SCENARIO F — Admin opens Hub Learning and changes several filters

Not a Core learner path. Counts from Phase 2 Admin change (`learning-platform-admin` Hub Learning local filter/summary):

| Action | ADMIN RPCs |
|---|---|
| Initial open | **2** (`list_hub_learning_result_filters` + `list_hub_learning_results`) |
| Each filter change | **0** |
| Open row evidence | `list_hub_learning_result_evidence` (unchanged, on demand) |

Core categorises those names as ADMIN. `summarise_hub_learning_results` is no longer called on this page.

### 16.6 3F — Post-deployment measurement plan

Do **not** start Phase 4 from these baselines. Compare live Supabase after compatible hubs are on `v0.2.25`.

**Windows:** 24 hours, 7 days, 28 days after T Level + Unit 3 production deploy (same weekday mix if possible).

**Raw series (where the project UI exposes them):**

| Series | Why |
|---|---|
| Total API requests | Headline vs the 9.4M monthly figure |
| REST / PostgREST / RPC | Application reads/writes; should move first |
| Auth | `getUser` / token refresh remain; bootstrap REST should not |
| Realtime | connections, join/leave, messages/heartbeats if split out |
| Database | CPU, WAL, IO — confirm REST drop is not replaced by load elsewhere |

**Normalise (preferred over totals):**

| Metric | How | Interprets |
|---|---|---|
| Requests per active learner | total REST / distinct learners with a session that day | classroom-size independent |
| Requests per learner session | REST / distinct Auth session starts | bootstrap efficiency |
| `save_activity_state` per activity with a draft | RPC count / activities that saved | debounce + dual-carrier |
| `get_activity_state` per week open | RPC count / week page views (or per unique learner-week) | fan-out vs intern |
| `published_curriculum_package` vs `published_curriculum` | ratio | cache-first working in prod |
| `my_hub_assignments` per session | should be ~1 at boot, not per analytics/filter | assignment snapshot |
| TOKEN_REFRESHED-hour REST | application RPCs should not spike hourly | Phase 2B |
| Realtime messages per signed-in learner-hour | if counted in 9.4M | whether heartbeats dominate |

**Success (Phase 3, not a new optimisation target):** T Level and Unit 3 production bundles resolve **0.2.25**; scenario-shaped traffic in logs is closer to §16.5 than to 0.2.23 TOKEN_REFRESHED bootstrap and repeated curriculum package RPCs.

**Do not treat as success/failure of 0.2.25:** Unit 14 / L2E / Readiness traffic (still old pins); Admin Group Generator 2.5s poller; Realtime heartbeats if they were always the bulk of 9.4M.

### 16.7 Unexpected request sources to watch (not changed)

- Unit 3 week 2–7 carrier hydrates on first signed-in load (**12** `GET_ACTIVITY_STATE` + **1** `PROGRESS`) — remaining, intentional.
- WeekPage hydrate-all for the opened week.
- Unit 3 **2** `SAVE_ACTIVITY_STATE` per coalesced host edit.
- Auth SDK refresh + Realtime heartbeats (outside Core counters).
- Admin Group Generator poll.
- Hubs not pinned to 0.2.25.

No new unexpected Core path was found during 3A.

### 16.8 Phase 3 report

1. **Release validation:** **passed**. No accidental unrelated Core changes. 267 Core tests passed. T Level `npm test` passed. Unit 3 `test:node` passed. Persistence, token rotation, Realtime `setAuth`, Check/Finish, dual carriers, and curriculum cache-first held.
2. **Tagged:** **yes.** [`v0.2.25`](https://github.com/Acerosa/learning-platform-core/releases/tag/v0.2.25) on `1d7cd87` (PR #30). `0.2.24` was never tagged.
3. **Hubs moved:** T Level (PR #53) and Unit 3 (PR #93) only. Unit 14 / L2E / Readiness **not** moved.
4. **Exact deployed Core versions:** T Level live **0.2.25** (`main-CVTVJHIU.js`). Unit 3 live **0.2.25** (`main-B20YSmG6.js`). Both Pages deploys succeeded after cloning `v0.2.25`.
5. **Regression tests:** Core `npm run check` **267 passed**. T Level full `npm test` **passed** before and after re-pin (includes Vite build). Unit 3 `test:node` **passed** after re-pin (includes 0.2.25 pin assertions, persistence, dual-carrier coalesce). Hub Pages **build** jobs on the pin merges **passed**. Unrelated Unit 3 vitest week5-defensive classification retry UI failure is unchanged.
6. **Baseline request counts:** §16.5 tables (scenarios A–F). These are Core logical operations from the fake-Supabase harness, plus documented hub overlays. They are not live dashboard samples.
7. **Recommended metrics:** §16.6 (24h / 7d / 28d; REST vs Auth vs Realtime vs DB; normalised per learner/session/activity).
8. **Regressions / unexpected sources:** none in 0.2.23→0.2.25. Remaining expected volume is §16.7.

*Phase 3 is release + measurement. Do not start Phase 4 optimisation until 24h / 7d / 28d production series exist.*


