import { PlatformError, mapPlatformError } from "../errors/platform-error.js";
import { evidence, toApiResponse } from "../evidence/evidence.js";
import { applyFormativeContract } from "./formative-contract.js";
import {
  FORBIDDEN_SUBMISSION_FIELD,
  resolveActivityVersion
} from "../security/hub-security-baseline.js";

const CHECK_FAILED_MESSAGE = "Your answer could not be checked. Please try again.";
const RETRY_LIMIT_MESSAGE = "You have used all allowed checks for this question.";
const ALLOWED_MARK_INPUT = new Set([
  "activityKey",
  "activityVersion",
  "block",
  "responses",
  "clientCheckId",
  "sourcePage"
]);

function generateCheckId(runtimeCrypto) {
  if (typeof runtimeCrypto?.randomUUID === "function") return runtimeCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  runtimeCrypto?.getRandomValues?.(bytes);
  if (bytes.every((value) => value === 0)) {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sourcePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  try {
    return new URL(raw, "https://hub.invalid").pathname;
  } catch {
    return raw.split(/[?#]/, 1)[0] || null;
  }
}

function assertAllowedMarkInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlatformError({ code: "INVALID_SUBMISSION", category: "validation" });
  }
  Object.keys(input).forEach((key) => {
    if (!ALLOWED_MARK_INPUT.has(key)) {
      throw new PlatformError({
        code: "FORBIDDEN_SUBMISSION_FIELD",
        category: "submission",
        diagnostic: { field: key }
      });
    }
  });
}

function requiredString(value, code) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) throw new PlatformError({ code, category: "validation" });
  return clean;
}

function questionIdFor(block) {
  return String(block?.content?.questionId || block?.id || "").trim();
}

function blockType(block) {
  return String(block?.type || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const MARKING_FIELD = /^(correctOptionId|correctCategoryId|correctValues|answerKey|markScheme|modelAnswer|correctOptions|correctOrder|spec)$/;

function learnerSafeValue(value) {
  if (Array.isArray(value)) return value.map(learnerSafeValue);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, nested] of Object.entries(value)) {
    if (MARKING_FIELD.test(key)) continue;
    if (key === "correct" && nested && typeof nested === "object") continue;
    next[key] = learnerSafeValue(nested);
  }
  return next;
}

function assertNoForbiddenInput(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenInput);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_SUBMISSION_FIELD.test(key)) {
      throw new PlatformError({
        code: "FORBIDDEN_SUBMISSION_FIELD",
        category: "submission",
        diagnostic: { field: key }
      });
    }
    assertNoForbiddenInput(nested);
  }
}

function evidenceItems(block, responses) {
  const type = blockType(block);
  const questionId = questionIdFor(block);
  if (!questionId) {
    throw new PlatformError({ code: "QUESTION_KEY_REQUIRED", category: "validation" });
  }

  if (type === "single-choice" || type === "option-cards") {
    const optionId = typeof responses === "string"
      ? responses
      : asObject(responses).optionId;
    return [evidence.singleChoice(questionId, optionId)];
  }

  if (type === "classification") {
    const assignments = asObject(responses);
    const items = Array.isArray(block?.content?.items) ? block.content.items : [];
    if (!items.length) {
      throw new PlatformError({ code: "RESPONSES_REQUIRED", category: "validation" });
    }
    return items.map((item) => {
      const itemId = String(item?.id || "").trim();
      if (!itemId) {
        throw new PlatformError({ code: "QUESTION_KEY_REQUIRED", category: "validation" });
      }
      return evidence.classification(`${questionId}:${itemId}`, assignments[itemId], itemId);
    });
  }

  if (type === "short-response") {
    const text = typeof responses === "string" ? responses : asObject(responses).text;
    return [evidence.written(questionId, text)];
  }

  if (type === "reflection") {
    const text = typeof responses === "string" ? responses : asObject(responses).text;
    return [evidence.reflection(questionId, text)];
  }

  if (type === "drag-drop") {
    const placements = asObject(responses);
    const items = Array.isArray(block?.content?.items) ? block.content.items : [];
    return [evidence.matching(
      questionId,
      items.map((item) => ({
        left: String(item?.id || "").trim(),
        right: String(placements[item?.id] || "").trim()
      }))
    )];
  }

  if (type === "ordering" || type === "sequence") {
    const itemIds = Array.isArray(asObject(responses).itemIds)
      ? asObject(responses).itemIds
      : [];
    return [evidence.ordering(questionId, itemIds)];
  }

  if (type === "fill-gap" || type === "phrase-completion") {
    const placements = asObject(responses);
    const gaps = Array.isArray(block?.content?.gaps) && block.content.gaps.length
      ? block.content.gaps
      : [{ id: "gap" }];
    return gaps.map((gap) => {
      const gapId = String(gap?.id || "").trim() || "gap";
      return evidence.singleChoice(`${questionId}:${gapId}`, placements[gapId]);
    });
  }

  throw new PlatformError({ code: "UNSUPPORTED_BLOCK_TYPE", category: "validation" });
}

function numeric(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function mapRow(row) {
  const correctValue = row?.is_correct;
  const review = Boolean(row?.requires_review);
  const maxScore = numeric(row?.max_score);
  const awardedScore = numeric(row?.awarded_score);
  const correct = correctValue === true ? true : correctValue === false ? false : null;
  const scored = !review && correct !== null && maxScore > 0;
  const remaining = row?.remaining_attempts == null ? null : numeric(row.remaining_attempts);
  return Object.freeze({
    questionId: String(row?.question_id || ""),
    awardedScore,
    maxScore,
    correct,
    requiresReview: review,
    markingSource: "server",
    checkNumber: numeric(row?.check_number) || undefined,
    remainingAttempts: remaining,
    canRetry: row?.can_retry === false ? false : row?.can_retry === true ? true : undefined,
    score: scored
      ? Object.freeze({ correct: awardedScore, total: maxScore })
      : undefined
  });
}

function itemIdFromQuestion(questionId, prefix) {
  if (!prefix || !questionId.startsWith(`${prefix}:`)) return undefined;
  return questionId.slice(prefix.length + 1);
}

function aggregateRows(rows, block) {
  const mapped = rows.map(mapRow);
  const requiresReview = mapped.some((item) => item.requiresReview);
  const scored = mapped.filter((item) => item.score);
  const allCorrect = mapped.length > 0 && mapped.every((item) => item.correct === true);
  const anyIncorrect = mapped.some((item) => item.correct === false);
  const correct = requiresReview ? null : allCorrect ? true : anyIncorrect ? false : null;
  const score = scored.length
    ? Object.freeze({
      correct: scored.reduce((total, item) => total + item.score.correct, 0),
      total: scored.reduce((total, item) => total + item.score.total, 0)
    })
    : undefined;
  const status = requiresReview
    ? "review"
    : correct === true
      ? "correct"
      : correct === false
        ? "incorrect"
        : "recorded";
  const prefix = questionIdFor(block);
  const remainingValues = mapped
    .map((item) => item.remainingAttempts)
    .filter((value) => value != null);
  const remainingAttempts = mapped.some((item) => item.remainingAttempts == null)
    ? null
    : remainingValues.length
      ? Math.min(...remainingValues)
      : undefined;
  return Object.freeze({
    completed: true,
    correct,
    requiresReview,
    score,
    status,
    remainingAttempts,
    canRetry: mapped.length > 0 && mapped.every((item) => item.canRetry !== false),
    checkNumber: mapped.reduce((highest, item) => Math.max(highest, item.checkNumber || 0), 0) || undefined,
    itemResults: Object.freeze(mapped.map((item) => Object.freeze({
      questionId: item.questionId,
      itemId: itemIdFromQuestion(item.questionId, prefix),
      correct: item.correct,
      requiresReview: item.requiresReview
    })))
  });
}

export function createFormativeMarkingService({
  api,
  auth = null,
  crypto = globalThis.crypto,
  resolveFormativeContract = null
} = {}) {
  let pendingCheck = null;

  function requireSignedIn() {
    if (!auth || typeof auth.isSignedIn !== "function") return;
    if (auth.isSignedIn() !== true) {
      throw new PlatformError({ code: "AUTH_REQUIRED", category: "authentication" });
    }
  }

  function payloadKey(activityKey, activityVersion, items) {
    return JSON.stringify({ activityKey, activityVersion, items });
  }

  function resolveClientCheckId(key, supplied) {
    if (supplied) {
      const id = requiredString(supplied, "INVALID_CLIENT_CHECK_ID");
      pendingCheck = { key, clientCheckId: id };
      return id;
    }
    if (pendingCheck && pendingCheck.key === key) return pendingCheck.clientCheckId;
    const id = generateCheckId(crypto);
    pendingCheck = { key, clientCheckId: id };
    return id;
  }

  async function markBlock(input = {}) {
    requireSignedIn();
    assertAllowedMarkInput(input);
    assertNoForbiddenInput(input);
    const activityKey = requiredString(input.activityKey, "ACTIVITY_KEY_REQUIRED");
    const activityVersion = requiredString(
      resolveActivityVersion({ version: input.activityVersion }),
      "ACTIVITY_VERSION_REQUIRED"
    );
    const block = learnerSafeValue(input.block);
    const items = evidenceItems(block, input.responses).map(toApiResponse);
    if (!items.length) {
      throw new PlatformError({ code: "RESPONSES_REQUIRED", category: "validation" });
    }
    const canonical = await applyFormativeContract(resolveFormativeContract, {
      activityKey,
      activityVersion,
      responses: items
    });
    const key = payloadKey(canonical.activityKey, canonical.activityVersion, canonical.responses);
    const clientCheckId = resolveClientCheckId(key, input.clientCheckId);
    try {
      const data = await api.markFormativeResponse({
        p_activity_key: canonical.activityKey,
        p_activity_version: canonical.activityVersion,
        p_responses: canonical.responses,
        p_client_check_id: clientCheckId,
        p_source_page: sourcePath(input.sourcePage)
      });
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (!rows.length) {
        throw new PlatformError({
          code: "MARK_FAILED",
          category: "platform",
          learnerMessage: CHECK_FAILED_MESSAGE
        });
      }
      pendingCheck = null;
      return aggregateRows(rows, block);
    } catch (error) {
      if (error instanceof PlatformError && error.category === "authentication") throw error;
      const code = String(error?.code || error?.message || "");
      if (/FORMATIVE_RETRY_LIMIT/i.test(code)) {
        throw mapPlatformError(error, {
          operation: "mark-formative-response",
          code: "FORMATIVE_RETRY_LIMIT",
          category: "validation",
          learnerMessage: RETRY_LIMIT_MESSAGE
        });
      }
      throw mapPlatformError(error, {
        operation: "mark-formative-response",
        learnerMessage: CHECK_FAILED_MESSAGE
      });
    }
  }

  return Object.freeze({
    markBlock
  });
}
