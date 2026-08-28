/**
 * @typedef {Object} WeekMetadata
 * @property {number} [teachingWeek]
 * @property {string} [title]
 * @property {string} [status]
 * @property {string} [weekCommencing]
 */

/**
 * @typedef {Object} ContentWeek
 * @property {string} id
 * @property {WeekMetadata} [metadata]
 * @property {Record<string, unknown>} [relationships]
 */

/**
 * @typedef {Object} ContentPackage
 * @property {ContentWeek[]} [weeks]
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
 * Canonical learner-access rule: only `week.metadata.status === "available"`
 * makes a week open to learners. Planned, archived, missing and unknown values
 * are never accessible.
 *
 * @param {string | null | undefined} status
 * @returns {boolean}
 */
export function isWeekAvailable(status) {
  return String(status ?? "").trim().toLowerCase() === "available";
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
export function overlayLiveWeekMetadata(base, live) {
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
    ? overlayLiveWeekMetadata(basePackage, livePackage)
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
