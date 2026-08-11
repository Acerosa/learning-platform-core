import { PlatformError } from "../errors/platform-error.js";

export const EVIDENCE_TYPES = Object.freeze([
  "single-choice",
  "multi-select",
  "matching",
  "ordering",
  "written",
  "reflection",
  "coding",
  "classification"
]);

function questionKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) throw new PlatformError({ code: "QUESTION_KEY_REQUIRED", category: "validation" });
  return key;
}

function item(key, type, value) {
  return Object.freeze({ questionKey: questionKey(key), evidenceType: type, value });
}

function stringList(value, code) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new PlatformError({ code, category: "validation" });
  }
  return Object.freeze(value.map((entry) => entry.trim()));
}

export function singleChoice(key, optionId) {
  const selected = typeof optionId === "string" ? optionId.trim() : "";
  if (!selected) throw new PlatformError({ code: "OPTION_REQUIRED", category: "validation" });
  return item(key, "single-choice", Object.freeze({ optionId: selected }));
}

export function multiSelect(key, optionIds) {
  return item(key, "multi-select", Object.freeze({ optionIds: stringList(optionIds, "OPTIONS_REQUIRED") }));
}

export function matching(key, pairs) {
  if (!Array.isArray(pairs) || pairs.some((pair) => !pair || typeof pair.left !== "string" || typeof pair.right !== "string")) {
    throw new PlatformError({ code: "MATCHING_PAIRS_REQUIRED", category: "validation" });
  }
  return item(key, "matching", Object.freeze({
    pairs: Object.freeze(pairs.map((pair) => Object.freeze({ left: pair.left.trim(), right: pair.right.trim() })))
  }));
}

export function ordering(key, itemIds) {
  return item(key, "ordering", Object.freeze({ itemIds: stringList(itemIds, "ORDER_REQUIRED") }));
}

export function written(key, text) {
  return item(key, "written", Object.freeze({ text: String(text ?? "") }));
}

export function reflection(key, text) {
  return item(key, "reflection", Object.freeze({ text: String(text ?? "") }));
}

export function coding(key, sourceCode, { language = null, output = null } = {}) {
  return item(key, "coding", Object.freeze({
    sourceCode: String(sourceCode ?? ""),
    language: typeof language === "string" && language.trim() ? language.trim() : null,
    output: typeof output === "string" ? output : null
  }));
}

export function classification(key, categoryId, itemId = null) {
  const category = typeof categoryId === "string" ? categoryId.trim() : "";
  if (!category) throw new PlatformError({ code: "CATEGORY_REQUIRED", category: "validation" });
  return item(key, "classification", Object.freeze({
    categoryId: category,
    itemId: typeof itemId === "string" && itemId.trim() ? itemId.trim() : null
  }));
}

export function toApiResponse(evidence) {
  if (!evidence || !EVIDENCE_TYPES.includes(evidence.evidenceType)) {
    throw new PlatformError({ code: "INVALID_EVIDENCE", category: "validation" });
  }
  return Object.freeze({
    question_id: questionKey(evidence.questionKey),
    response_type: evidence.evidenceType,
    response_payload: evidence.value
  });
}

export const evidence = Object.freeze({
  singleChoice,
  multiSelect,
  matching,
  ordering,
  written,
  reflection,
  coding,
  classification,
  toApiResponse
});
