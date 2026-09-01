import test from "node:test";
import assert from "node:assert/strict";
import { createFormativeMarkingService } from "../../src/core/marking/formative-marking-service.js";
import { PlatformError } from "../../src/core/errors/platform-error.js";

function service(rpcs, signedIn = true) {
  const calls = [];
  return {
    calls,
    marking: createFormativeMarkingService({
      auth: { isSignedIn: () => signedIn },
      api: {
        markFormativeResponse: async (payload) => {
          calls.push(payload);
          if (typeof rpcs === "function") return rpcs(payload);
          return rpcs;
        }
      }
    })
  };
}

test("markBlock sends evidence-only payloads and maps a correct server result", async () => {
  const { marking, calls } = service([{
    question_id: "q1",
    awarded_score: 1,
    max_score: 1,
    is_correct: true,
    requires_review: false,
    marking_source: "server"
  }]);
  const result = await marking.markBlock({
    activityKey: "demo-option-cards",
    activityVersion: "1.0.0",
    block: {
      id: "q1",
      type: "single-choice",
      content: { questionId: "q1", prompt: "Choose" }
    },
    responses: { optionId: "iaas" }
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].p_activity_key, "demo-option-cards");
  assert.deepEqual(calls[0].p_activity_version, "1.0.0");
  assert.match(calls[0].p_client_check_id, /^[A-Za-z0-9._:-]+$/);
  assert.equal(JSON.stringify(calls[0]).includes("awarded_score"), false);
  assert.equal(JSON.stringify(calls[0]).includes("is_correct"), false);
  assert.equal(JSON.stringify(calls[0]).includes("learner_id"), false);
  assert.deepEqual(calls[0].p_responses, [{
    question_id: "q1",
    response_type: "single-choice",
    response_payload: { optionId: "iaas" }
  }]);
  assert.equal(result.completed, true);
  assert.equal(result.correct, true);
  assert.equal(result.requiresReview, false);
  assert.deepEqual(result.score, { correct: 1, total: 1 });
  assert.equal(result.status, "correct");
});

test("markBlock expands classification mappings to hosted item keys", async () => {
  const { marking, calls } = service((payload) => payload.p_responses.map((item) => ({
    question_id: item.question_id,
    awarded_score: 1,
    max_score: 1,
    is_correct: true,
    requires_review: false,
    marking_source: "server"
  })));
  const result = await marking.markBlock({
    activityKey: "u14-w1-biz-class",
    activityVersion: "0.1.0",
    block: {
      id: "w1-biz-class",
      type: "classification",
      content: {
        questionId: "u14-w1-biz-class",
        items: [{ id: "customer-name" }, { id: "item-quantity" }]
      }
    },
    responses: { "customer-name": "string", "item-quantity": "integer" }
  });
  assert.deepEqual(
    calls[0].p_responses.map((item) => item.question_id),
    ["u14-w1-biz-class:customer-name", "u14-w1-biz-class:item-quantity"]
  );
  assert.equal(result.itemResults[0].itemId, "customer-name");
  assert.equal(JSON.stringify(result).includes("correctCategoryId"), false);
  assert.equal(result.correct, true);
  assert.deepEqual(result.score, { correct: 2, total: 2 });
});

test("markBlock maps check number, retry remaining, and review without a fake score", async () => {
  const { marking } = service([{
    question_id: "reflect",
    check_number: 1,
    awarded_score: 0,
    max_score: 1,
    is_correct: null,
    requires_review: true,
    marking_source: "server",
    remaining_attempts: null,
    can_retry: true
  }]);
  const result = await marking.markBlock({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    block: { id: "reflect", type: "reflection", content: { questionId: "reflect" } },
    responses: "A valid reflection that should be reviewed."
  });
  assert.equal(result.completed, true);
  assert.equal(result.correct, null);
  assert.equal(result.requiresReview, true);
  assert.equal(result.score, undefined);
  assert.equal(result.status, "review");
  assert.equal(result.checkNumber, 1);
  assert.equal(result.canRetry, true);
  assert.equal(result.remainingAttempts, null);
});

test("markBlock maps exhausted retry from the server result", async () => {
  const { marking } = service([{
    question_id: "q1",
    check_number: 1,
    awarded_score: 0,
    max_score: 1,
    is_correct: false,
    requires_review: false,
    marking_source: "server",
    remaining_attempts: 0,
    can_retry: false
  }]);
  const result = await marking.markBlock({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    clientCheckId: "check-1",
    block: { id: "q1", type: "single-choice", content: { questionId: "q1" } },
    responses: { optionId: "b" }
  });
  assert.equal(result.canRetry, false);
  assert.equal(result.remainingAttempts, 0);
  assert.equal(result.checkNumber, 1);
});

test("markBlock replays the same clientCheckId without inventing a local mark", async () => {
  const { marking, calls } = service([{
    question_id: "q1",
    check_number: 1,
    awarded_score: 1,
    max_score: 1,
    is_correct: true,
    requires_review: false,
    marking_source: "server",
    remaining_attempts: null,
    can_retry: true
  }]);
  await marking.markBlock({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    clientCheckId: "same-check",
    block: { id: "q1", type: "single-choice", content: { questionId: "q1" } },
    responses: { optionId: "a" }
  });
  await marking.markBlock({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    clientCheckId: "same-check",
    block: { id: "q1", type: "single-choice", content: { questionId: "q1" } },
    responses: { optionId: "a" }
  });
  assert.equal(calls[0].p_client_check_id, "same-check");
  assert.equal(calls[1].p_client_check_id, "same-check");
});

test("markBlock does not forward answer keys from an authoring block", async () => {
  const { marking, calls } = service([{
    question_id: "q1",
    awarded_score: 1,
    max_score: 1,
    is_correct: true,
    requires_review: false,
    marking_source: "server"
  }]);
  await marking.markBlock({
    activityKey: "demo-option-cards",
    activityVersion: "1.0.0",
    block: {
      id: "q1",
      type: "single-choice",
      content: { questionId: "q1", prompt: "Choose", correctOptionId: "a" }
    },
    responses: { optionId: "a" }
  });
  const payload = JSON.stringify(calls[0]);
  assert.equal(payload.includes("correctOptionId"), false);
  assert.equal(payload.includes("answerKey"), false);
  assert.equal(payload.includes("markScheme"), false);
});

test("markBlock rejects client identity and mark fields", async () => {
  const { marking } = service([]);
  await assert.rejects(
    () => marking.markBlock({
      activityKey: "activity-1",
      activityVersion: "1.0.0",
      learner_id: "forged",
      block: { id: "q1", type: "single-choice" },
      responses: { optionId: "a", is_correct: true, awarded_score: 1 }
    }),
    (error) => error instanceof PlatformError && error.code === "FORBIDDEN_SUBMISSION_FIELD"
  );
});

test("markBlock requires a signed-in learner and an explicit activity version", async () => {
  const unsigned = service([], false);
  await assert.rejects(
    () => unsigned.marking.markBlock({
      activityKey: "activity-1",
      activityVersion: "1.0.0",
      block: { id: "q1", type: "single-choice" },
      responses: { optionId: "a" }
    }),
    (error) => error instanceof PlatformError && error.code === "AUTH_REQUIRED"
  );
  const { marking } = service([]);
  await assert.rejects(
    () => marking.markBlock({
      activityKey: "activity-1",
      activityVersion: "latest",
      block: { id: "q1", type: "single-choice" },
      responses: { optionId: "a" }
    }),
    (error) => error instanceof PlatformError && error.code === "ACTIVITY_VERSION_REQUIRED"
  );
});

test("markBlock surfaces a server retry limit without a local fallback", async () => {
  const { marking } = service(() => {
    throw Object.assign(new Error("FORMATIVE_RETRY_LIMIT"), { code: "FORMATIVE_RETRY_LIMIT" });
  });
  await assert.rejects(
    () => marking.markBlock({
      activityKey: "activity-1",
      activityVersion: "1.0.0",
      block: { id: "q1", type: "single-choice" },
      responses: { optionId: "a" }
    }),
    (error) => error instanceof PlatformError
      && error.code === "FORMATIVE_RETRY_LIMIT"
      && error.learnerMessage === "You have used all allowed checks for this question."
  );
});

test("markBlock does not forward answer-key fields from an RPC row", async () => {
  const { marking } = service([{
    question_id: "q1",
    awarded_score: 1,
    max_score: 1,
    is_correct: true,
    requires_review: false,
    marking_source: "server",
    correctOptionId: "iaas",
    spec: { mode: "single-choice" },
    answerKey: "hidden"
  }]);
  const result = await marking.markBlock({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    block: { id: "q1", type: "single-choice", content: { questionId: "q1" } },
    responses: { optionId: "a" }
  });
  const json = JSON.stringify(result);
  assert.equal(json.includes("correctOptionId"), false);
  assert.equal(json.includes("answerKey"), false);
  assert.equal(json.includes("spec"), false);
  assert.equal(result.correct, true);
});

test("markBlock maps a conflicting clientCheckId without inventing a local mark", async () => {
  const { marking } = service(() => {
    throw Object.assign(new Error("CLIENT_CHECK_ID_CONFLICT"), { code: "CLIENT_CHECK_ID_CONFLICT" });
  });
  await assert.rejects(
    () => marking.markBlock({
      activityKey: "activity-1",
      activityVersion: "1.0.0",
      clientCheckId: "same-check",
      block: { id: "q1", type: "single-choice" },
      responses: { optionId: "b" }
    }),
    (error) => error instanceof PlatformError
      && error.learnerMessage === "Your answer could not be checked. Please try again."
  );
});

test("unknown-question failures stay closed and do not invent a local mark", async () => {
  const { marking } = service(() => {
    throw Object.assign(new Error("UNKNOWN_QUESTION"), { code: "UNKNOWN_QUESTION" });
  });
  await assert.rejects(
    () => marking.markBlock({
      activityKey: "activity-1",
      activityVersion: "1.0.0",
      block: { id: "q1", type: "single-choice" },
      responses: { optionId: "a" }
    }),
    (error) => error instanceof PlatformError
      && error.learnerMessage === "Your answer could not be checked. Please try again."
  );
});

test("a lost or failed check retry reuses the same clientCheckId", async () => {
  let calls = 0;
  const { marking, calls: payloads } = service(() => {
    calls += 1;
    if (calls === 1) {
      throw Object.assign(new Error("network"), { code: "NETWORK" });
    }
    return [{
      question_id: "q1",
      awarded_score: 0,
      max_score: 1,
      is_correct: false,
      requires_review: false,
      marking_source: "server",
      check_number: 1
    }];
  });
  const input = {
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    block: { id: "q1", type: "single-choice", content: { questionId: "q1" } },
    responses: { optionId: "a" }
  };
  await assert.rejects(() => marking.markBlock(input));
  const result = await marking.markBlock(input);
  assert.equal(payloads[0].p_client_check_id, payloads[1].p_client_check_id);
  assert.equal(result.completed, true);
});

test("a changed learner response gets a new clientCheckId", async () => {
  let calls = 0;
  const { marking, calls: payloads } = service(() => {
    calls += 1;
    if (calls === 1) {
      throw Object.assign(new Error("network"), { code: "NETWORK" });
    }
    return [{
      question_id: "q1",
      awarded_score: 1,
      max_score: 1,
      is_correct: true,
      requires_review: false,
      marking_source: "server"
    }];
  });
  const block = { id: "q1", type: "single-choice", content: { questionId: "q1" } };
  await assert.rejects(() => marking.markBlock({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    block,
    responses: { optionId: "a" }
  }));
  await marking.markBlock({
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    block,
    responses: { optionId: "b" }
  });
  assert.notEqual(payloads[0].p_client_check_id, payloads[1].p_client_check_id);
});

test("a successful check clears the pending clientCheckId", async () => {
  const { marking, calls } = service([{
    question_id: "q1",
    awarded_score: 1,
    max_score: 1,
    is_correct: true,
    requires_review: false,
    marking_source: "server"
  }]);
  const input = {
    activityKey: "activity-1",
    activityVersion: "1.0.0",
    block: { id: "q1", type: "single-choice", content: { questionId: "q1" } },
    responses: { optionId: "a" }
  };
  await marking.markBlock(input);
  await marking.markBlock(input);
  assert.notEqual(calls[0].p_client_check_id, calls[1].p_client_check_id);
});
