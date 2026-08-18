export const CURRICULUM_CACHE_PREFIX = "lp.curriculum.cache.v1";
export const SUPPORTED_SCHEMA_VERSION = "0.1.0";
export const SUPPORTED_PACKAGE_VERSION = "0.1.0";

export const PUBLICATION_STATES = Object.freeze([
  "PUBLISHED",
  "FALLBACK",
  "NO_PUBLICATION",
  "INCOMPATIBLE",
  "ERROR"
]);

export const LEARNER_COPY = Object.freeze({
  PUBLISHED: "This teaching copy is the official published course version.",
  FALLBACK: "This page is showing the saved teaching copy because the live course version could not be loaded. You can still read and practise. Progress will not be saved to your learning record until the live version is available.",
  NO_PUBLICATION: "This course version is not officially published yet. You can still read and practise. Progress will not be saved to your learning record yet.",
  INCOMPATIBLE: "This teaching copy cannot be used as the live course version. You can still read the saved copy. Progress cannot be saved to your learning record.",
  ERROR: "The live course version could not be confirmed. You can still read the saved teaching copy. Saving progress is temporarily unavailable."
});

export const LEARNER_LABELS = Object.freeze({
  PUBLISHED: "Current",
  FALLBACK: "Saved copy",
  NO_PUBLICATION: "Preview",
  INCOMPATIBLE: "Unavailable to save",
  ERROR: "Temporarily unable to save progress"
});

export function compareSemver(left, right) {
  const a = String(left || "0.0.0").split(".").map((part) => Number(part) || 0);
  const b = String(right || "0.0.0").split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
}

export function firstRow(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload && typeof payload === "object") return payload;
  return null;
}
