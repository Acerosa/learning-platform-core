import test from "node:test";
import assert from "node:assert/strict";
import { evidence, EVIDENCE_TYPES } from "../../src/core/evidence/evidence.js";
import { assertSecureSubmission, createSubmissionService } from "../../src/core/submission/submission-service.js";
import { memoryStorage } from "../helpers.js";

const allEvidence = [
  evidence.singleChoice("q1", "a"),
  evidence.multiSelect("q2", ["a", "b"]),
  evidence.matching("q3", [{ left: "a", right: "b" }]),
  evidence.ordering("q4", ["first", "second"]),
  evidence.written("q5", "Answer"),
  evidence.reflection("q6", "Reflection"),
  evidence.coding("q7", "print('hello')", { language: "python" }),
  evidence.classification("q8", "category-a", "item-1")
];

test("evidence helpers cover every neutral evidence type", () => {
  assert.deepEqual(allEvidence.map((item) => item.evidenceType), EVIDENCE_TYPES);
  assert.equal(allEvidence.every(Object.isFrozen), true);
});

test("submission payload contains exactly the approved RPC arguments", () => {
  const service = createSubmissionService({
    api: { submitAttempt: async (payload) => payload },
    storage: memoryStorage(),
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" }
  });
  const payload = service.buildPayload({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    responses: allEvidence,
    sourcePage: "https://hub.example/activity/?student=123#answer",
    startedAt: "2026-08-11T10:00:00Z",
    completedAt: "2026-08-11T10:05:00Z",
    programmingLanguage: "python"
  });
  assert.deepEqual(Object.keys(payload), [
    "p_activity_key", "p_activity_version", "p_client_attempt_id", "p_responses",
    "p_source_page", "p_started_at", "p_completed_at", "p_programming_language"
  ]);
  assert.equal(payload.p_source_page, "/activity/");
  assert.equal(JSON.stringify(payload).includes("awarded_score"), false);
  assert.equal(JSON.stringify(payload).includes("is_correct"), false);
});

test("submission boundary rejects identity, assignment and score fields", () => {
  for (const field of ["learnerId", "studentNumber", "email", "enrolmentId", "assignmentId", "attemptNumber", "score", "maxScore", "awarded_score", "is_correct"]) {
    assert.throws(
      () => assertSecureSubmission({ activityKey: "a", [field]: "unsafe" }),
      (error) => error.code === "FORBIDDEN_SUBMISSION_FIELD",
      field
    );
  }
});

test("toApiResponse strips nested client mark fields from the payload", () => {
  const payload = evidence.toApiResponse({
    questionKey: "q-nested",
    evidenceType: "written",
    value: {
      text: "learner answer",
      awarded_score: 6,
      is_correct: true,
      awardedScore: 6,
      isCorrect: true
    }
  });
  assert.deepEqual(payload.response_payload, { text: "learner answer" });
  assert.equal(JSON.stringify(payload).includes("awarded_score"), false);
  assert.equal(JSON.stringify(payload).includes("is_correct"), false);
});

test("failed retries retain the client attempt ID and success clears it", async () => {
  const storage = memoryStorage();
  let fail = true;
  const seen = [];
  const service = createSubmissionService({
    storage,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000002" },
    api: { submitAttempt: async (payload) => { seen.push(payload.p_client_attempt_id); if (fail) throw Object.assign(new Error(), { code: "NETWORK_ERROR" }); return { ok: true }; } }
  });
  const input = { activityKey: "a", activityVersion: "1.0.0", responses: [evidence.written("q1", "answer")] };
  await assert.rejects(service.submit(input));
  fail = false;
  await service.submit(input);
  assert.deepEqual(seen, [seen[0], seen[0]]);
  assert.deepEqual(storage.entries(), {});
});
