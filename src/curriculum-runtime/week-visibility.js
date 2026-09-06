/**
 * @typedef {Object} WeekMetadata
 * @property {number} [teachingWeek]
 * @property {string} [title]
 * @property {string} [status]
 * @property {string} [weekCommencing]
 */

/**
 * @typedef {Object} SessionMetadata
 * @property {string} [title]
 * @property {string} [status]
 * @property {string} [kind]
 * @property {number} [sortOrder]
 */

/**
 * @typedef {Object} ContentWeek
 * @property {string} id
 * @property {WeekMetadata} [metadata]
 * @property {Record<string, unknown>} [relationships]
 */

/**
 * @typedef {Object} ContentSession
 * @property {string} id
 * @property {SessionMetadata} [metadata]
 * @property {Record<string, unknown>} [relationships]
 */

/**
 * @typedef {Object} ContentPackage
 * @property {ContentWeek[]} [weeks]
 * @property {ContentSession[]} [sessions]
 * @property {Record<string, unknown>} [hub]
 * @property {Record<string, unknown>} [curriculum]
 */

/**
 * @typedef {Object} RuntimeWeekRecord
 * @property {string} id
 * @property {number} teachingWeek
 * @property {string} status
 * @property {boolean} available
 * @property {string} title
 */

/**
 * @typedef {Object} RuntimeSessionRecord
 * @property {string} id
 * @property {string} title
 * @property {string} status
 * @property {boolean} available
 * @property {string} [weekId]
 * @property {string} [kind]
 */

export const SESSION_NOT_RELEASED_COPY = "Not released yet";
export const POST_WEEK_BEFORE_SESSIONS_COPY = "Post the week before releasing individual sessions.";

/**
 * Canonical learner-access rule shared by weeks and sessions: only the
 * normalised value `"available"` is open. Planned, archived, missing and
 * unknown values are never accessible.
 *
 * @param {string | null | undefined} status
 * @returns {boolean}
 */
function isAvailableStatus(status) {
  return String(status ?? "").trim().toLowerCase() === "available";
}

/**
 * Canonical learner-access rule: only `week.metadata.status === "available"`
 * makes a week open to learners. Planned, archived, missing and unknown values
 * are never accessible.
 *
 * @param {string | null | undefined} status
 * @returns {boolean}
 */
export function isWeekAvailable(status) {
  return isAvailableStatus(status);
}

/**
 * Canonical learner-access rule for sessions: only
 * `session.metadata.status === "available"` is open. Planned, archived,
 * missing and unknown values are never accessible on their own.
 *
 * @param {string | null | undefined} status
 * @returns {boolean}
 */
export function isSessionAvailable(status) {
  return isAvailableStatus(status);
}

/**
 * Hierarchical learner-access rule. A session is accessible only when its
 * parent week is available and the session itself is available. An available
 * session inside a planned or archived week stays closed.
 *
 * @param {string | null | undefined} weekStatus
 * @param {string | null | undefined} sessionStatus
 * @returns {boolean}
 */
export function isSessionAccessible(weekStatus, sessionStatus) {
  return isWeekAvailable(weekStatus) && isSessionAvailable(sessionStatus);
}

/**
 * @param {ContentWeek | null | undefined} week
 * @returns {number | null}
 */
function teachingWeekNumber(week) {
  const n = Number(week?.metadata?.teachingWeek);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Overlay live publication week metadata onto a bundled package without
 * discarding bundled week structure or learner content. Live publication is
 * authoritative for `metadata.status` and `metadata.weekCommencing`.
 *
 * @param {ContentPackage | null | undefined} base
 * @param {ContentPackage | null | undefined} live
 * @returns {ContentPackage | null | undefined}
 */
function overlayLiveWeekMetadataOnly(base, live) {
  if (!base || typeof base !== "object") return base;
  if (!live?.weeks?.length) return base;

  /** @type {Map<string, WeekMetadata | undefined>} */
  const liveById = new Map();
  /** @type {Map<number, WeekMetadata | undefined>} */
  const liveByTeachingWeek = new Map();

  for (const week of live.weeks) {
    if (week?.id) liveById.set(week.id, week.metadata);
    const n = teachingWeekNumber(week);
    if (n != null && !liveByTeachingWeek.has(n)) liveByTeachingWeek.set(n, week.metadata);
  }

  return {
    ...base,
    weeks: (base.weeks || []).map((week) => {
      const n = teachingWeekNumber(week);
      const liveMeta = (week?.id ? liveById.get(week.id) : undefined)
        || (n != null ? liveByTeachingWeek.get(n) : undefined);
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

/**
 * Overlay live publication session metadata onto a bundled package without
 * discarding bundled session structure, activities, IDs or versions. Live
 * publication is authoritative for `session.metadata.status`.
 *
 * @param {ContentPackage | null | undefined} base
 * @param {ContentPackage | null | undefined} live
 * @returns {ContentPackage | null | undefined}
 */
export function overlayLiveSessionMetadata(base, live) {
  if (!base || typeof base !== "object") return base;
  if (!live?.sessions?.length) return base;

  /** @type {Map<string, SessionMetadata | undefined>} */
  const liveById = new Map();
  for (const session of live.sessions) {
    if (session?.id) liveById.set(session.id, session.metadata);
  }

  return {
    ...base,
    sessions: (base.sessions || []).map((session) => {
      const liveMeta = session?.id ? liveById.get(session.id) : undefined;
      if (!liveMeta) return session;
      const liveStatus = liveMeta.status == null ? "" : String(liveMeta.status).trim();
      return {
        ...session,
        metadata: {
          ...session.metadata,
          status: liveStatus || session.metadata?.status
        }
      };
    })
  };
}

/**
 * Overlay live week and session metadata in one pass. Live publication is
 * authoritative for week `status` / `weekCommencing` and session `status`.
 * Bundled structure, relationships, activities, IDs and versions are kept.
 *
 * @param {ContentPackage | null | undefined} base
 * @param {ContentPackage | null | undefined} live
 * @returns {ContentPackage | null | undefined}
 */
export function overlayLivePackageMetadata(base, live) {
  if (!base || typeof base !== "object") return base;
  const hasLiveWeeks = Boolean(live?.weeks?.length);
  const hasLiveSessions = Boolean(live?.sessions?.length);
  if (!hasLiveWeeks && !hasLiveSessions) return base;

  let next = base;
  if (hasLiveWeeks) next = overlayLiveWeekMetadataOnly(next, live);
  if (hasLiveSessions) next = overlayLiveSessionMetadata(next, live);
  return next;
}

/**
 * Overlay live publication week (and session) metadata onto a bundled package.
 * Kept as the hub-facing name; session status is included in the same pass so
 * callers do not need a second overlay.
 *
 * @param {ContentPackage | null | undefined} base
 * @param {ContentPackage | null | undefined} live
 * @returns {ContentPackage | null | undefined}
 */
export function overlayLiveWeekMetadata(base, live) {
  return overlayLivePackageMetadata(base, live);
}

/**
 * Derive normalised runtime week records from a published curriculum package.
 * When a live publication is supplied, its week metadata wins over bundled
 * fallback metadata before records are built.
 *
 * @param {ContentPackage | null | undefined} basePackage
 * @param {ContentPackage | null | undefined} [livePackage]
 * @returns {RuntimeWeekRecord[]}
 */
export function weeksFromPublication(basePackage, livePackage) {
  const pkg = livePackage?.weeks?.length
    ? overlayLivePackageMetadata(basePackage, livePackage)
    : basePackage;
  if (!pkg?.weeks?.length) return [];

  return [...pkg.weeks]
    .map((week) => {
      const teachingWeek = Number(week.metadata?.teachingWeek || 0);
      const status = String(week.metadata?.status ?? "").trim();
      return {
        id: week.id,
        teachingWeek,
        status,
        available: isWeekAvailable(status),
        title: week.metadata?.title || (teachingWeek ? `Week ${teachingWeek}` : week.id)
      };
    })
    .filter((week) => week.id && week.teachingWeek > 0)
    .sort((left, right) => left.teachingWeek - right.teachingWeek);
}

/**
 * @param {ContentSession | null | undefined} session
 * @returns {string}
 */
function sessionWeekId(session) {
  const rel = session?.relationships;
  if (!rel || typeof rel !== "object") return "";
  return String(rel.week || "");
}

/**
 * Derive normalised runtime session records from a published curriculum
 * package. `available` reflects session status only; hubs must still compose
 * with week availability via `isSessionAccessible`.
 *
 * @param {ContentPackage | null | undefined} basePackage
 * @param {ContentPackage | null | undefined} [livePackage]
 * @returns {RuntimeSessionRecord[]}
 */
export function sessionsFromPublication(basePackage, livePackage) {
  const pkg = (livePackage?.weeks?.length || livePackage?.sessions?.length)
    ? overlayLivePackageMetadata(basePackage, livePackage)
    : basePackage;
  if (!pkg?.sessions?.length) return [];

  return [...pkg.sessions]
    .filter((session) => session?.id)
    .map((session) => {
      const status = String(session.metadata?.status ?? "").trim();
      return {
        id: session.id,
        title: session.metadata?.title || session.id,
        status,
        available: isSessionAvailable(status),
        weekId: sessionWeekId(session),
        kind: session.metadata?.kind ? String(session.metadata.kind) : undefined
      };
    });
}
