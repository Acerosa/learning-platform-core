import test from "node:test";
import assert from "node:assert/strict";
import { createLearnerApi } from "../../src/core/api/learner-api.js";
import { createFormativeMarkingService } from "../../src/core/marking/formative-marking-service.js";
import { identityFormativeContract } from "../../src/core/marking/formative-contract.js";
import { PlatformError } from "../../src/core/errors/platform-error.js";
import { fakeSupabase } from "../helpers.js";

const MALWARE_BLOCK = Object.freeze({
  id: "week2-malware-symptoms-q-1-mw-q1",
  type: "single-choice",
  content: Object.freeze({
    formative: true,
    questionId: "week2-malware-symptoms:mw-q1",
    sourceQuestionId: "mw-q1"
  })
});

function unit3Resolver() {
  return async ({ activityKey, activityVersion, responses }) => ({
    activityKey,
    activityVersion: activityKey === "week2-malware-symptoms" && activityVersion === "1.0.0"
      ? "1.1.0"
      : activityVersion,
    responses: responses.map((item) => ({
      ...item,
      question_id: item.question_id === "week2-malware-symptoms:mw-q1"
        ? "MW-Q1"
        : item.question_id === "week2-threat-vulnerability-sort:sort-01"
          ? "SORT-01"
          : item.question_id === "week6-legislation-retrieval:lrq1"
            ? "LR1"
            : item.question_id === "week7-session1-retrieval:s1r-1"
              ? "S1R1"
              : item.question_id
    }))
  });
}

function signedInMarking(client, resolver) {
  const api = createLearnerApi({ client });
  return createFormativeMarkingService({
    auth: { isSignedIn: () => true },
    api,
    resolveFormativeContract: resolver
  });
}

function rpcPayload(client) {
  const call = client.calls.find((entry) => entry.type === "rpc" && entry.name === "mark_formative_response");
  assert.ok(call, "expected schema-scoped mark_formative_response rpc");
  assert.equal(client.calls.some((entry) => entry.type === "schema" && entry.name === "api"), true);
  return call.payload;
}

test("identityFormativeContract preserves canonical hub identifiers", () => {
  const result = identityFormativeContract({
    activityKey: "u14-w1-biz-class",
    activityVersion: "0.1.0",
    responses: [{
      question_id: "u14-w1-biz-class:customer-name",
      response_type: "classification",
      response_payload: { categoryId: "string" }
    }]
  });
  assert.deepEqual(result, {
    activityKey: "u14-w1-biz-class",
    activityVersion: "0.1.0",
    responses: [{
      question_id: "u14-w1-biz-class:customer-name",
      response_type: "classification",
      response_payload: { categoryId: "string" }
    }]
  });
});

test("markBlock applies resolver before schema(api).rpc receives the payload", async () => {
  const client = fakeSupabase({
    rpcs: {
      mark_formative_response: () => ([{
        question_id: "MW-Q1",
        awarded_score: 0,
        max_score: 1,
        is_correct: false,
        requires_review: false,
        marking_source: "server",
        check_number: 1,
        can_retry: true
      }])
    }
  });
  const marking = signedInMarking(client, unit3Resolver());
  await marking.markBlock({
    activityKey: "week2-malware-symptoms",
    activityVersion: "1.0.0",
    block: MALWARE_BLOCK,
    responses: { optionId: "a" }
  });
  const payload = rpcPayload(client);
  assert.equal(payload.p_activity_key, "week2-malware-symptoms");
  assert.equal(payload.p_activity_version, "1.1.0");
  assert.deepEqual(payload.p_responses, [{
    question_id: "MW-Q1",
    response_type: "single-choice",
    response_payload: { optionId: "a" }
  }]);
  assert.equal(JSON.stringify(payload).includes("student_id"), false);
  assert.equal(JSON.stringify(payload).includes("is_correct"), false);
});

test("markBlock leaves T Level identifiers unchanged without a resolver", async () => {
  const client = fakeSupabase({
    rpcs: {
      mark_formative_response: () => ([{
        question_id: "tl-w1-q1",
        awarded_score: 1,
        max_score: 1,
        is_correct: true,
        requires_review: false,
        marking_source: "server"
      }])
    }
  });
  const marking = signedInMarking(client, null);
  await marking.markBlock({
    activityKey: "tl-week1-activity",
    activityVersion: "1.0.0",
    block: {
      id: "tl-w1-q1",
      type: "single-choice",
      content: { questionId: "tl-w1-q1" }
    },
    responses: { optionId: "a" }
  });
  const payload = rpcPayload(client);
  assert.equal(payload.p_activity_key, "tl-week1-activity");
  assert.equal(payload.p_activity_version, "1.0.0");
  assert.equal(payload.p_responses[0].question_id, "tl-w1-q1");
});

test("markBlock leaves Unit 14 identifiers unchanged without a resolver", async () => {
  const client = fakeSupabase({
    rpcs: {
      mark_formative_response: () => ([{
        question_id: "u14-w2-gh-q1",
        awarded_score: 1,
        max_score: 1,
        is_correct: true,
        requires_review: false,
        marking_source: "server"
      }])
    }
  });
  const marking = signedInMarking(client, null);
  await marking.markBlock({
    activityKey: "week-2-gitignore",
    activityVersion: "1.0.0",
    block: {
      id: "u14-w2-gh-q1",
      type: "single-choice",
      content: { questionId: "u14-w2-gh-q1" }
    },
    responses: { optionId: "a" }
  });
  const payload = rpcPayload(client);
  assert.equal(payload.p_responses[0].question_id, "u14-w2-gh-q1");
});

test("markBlock leaves L2E identifiers unchanged without a resolver", async () => {
  const client = fakeSupabase({
    rpcs: {
      mark_formative_response: () => ([{
        question_id: "l2e-w1-q1",
        awarded_score: 1,
        max_score: 1,
        is_correct: true,
        requires_review: false,
        marking_source: "server"
      }])
    }
  });
  const marking = signedInMarking(client, null);
  await marking.markBlock({
    activityKey: "l2e-week1-activity",
    activityVersion: "1.0.0",
    block: {
      id: "l2e-w1-q1",
      type: "single-choice",
      content: { questionId: "l2e-w1-q1" }
    },
    responses: { optionId: "a" }
  });
  const payload = rpcPayload(client);
  assert.equal(payload.p_responses[0].question_id, "l2e-w1-q1");
});

test("markBlock maps classification composite ids through the resolver", async () => {
  const client = fakeSupabase({
    rpcs: {
      mark_formative_response: (payload) => payload.p_responses.map((item) => ({
        question_id: item.question_id,
        awarded_score: 1,
        max_score: 1,
        is_correct: true,
        requires_review: false,
        marking_source: "server"
      }))
    }
  });
  const marking = signedInMarking(client, unit3Resolver());
  await marking.markBlock({
    activityKey: "week2-threat-vulnerability-sort",
    activityVersion: "1.0.0",
    block: {
      id: "week2-threat-vulnerability-sort",
      type: "classification",
      content: {
        questionId: "week2-threat-vulnerability-sort",
        items: [{ id: "sort-01" }]
      }
    },
    responses: { "sort-01": "threat" }
  });
  const payload = rpcPayload(client);
  assert.equal(payload.p_responses[0].question_id, "SORT-01");
});

test("markBlock maps Week 6 and Week 7 aliases through the resolver", async () => {
  const clientWeek6 = fakeSupabase({
    rpcs: {
      mark_formative_response: (payload) => payload.p_responses.map((item) => ({
        question_id: item.question_id,
        awarded_score: 1,
        max_score: 1,
        is_correct: true,
        requires_review: false,
        marking_source: "server"
      }))
    }
  });
  const markingWeek6 = signedInMarking(clientWeek6, unit3Resolver());
  await markingWeek6.markBlock({
    activityKey: "week6-legislation-retrieval",
    activityVersion: "1.0.0",
    block: {
      id: "lrq1",
      type: "short-response",
      content: { questionId: "week6-legislation-retrieval:lrq1" }
    },
    responses: { text: "answer" }
  });
  assert.equal(rpcPayload(clientWeek6).p_responses[0].question_id, "LR1");

  const clientWeek7 = fakeSupabase({
    rpcs: {
      mark_formative_response: (payload) => payload.p_responses.map((item) => ({
        question_id: item.question_id,
        awarded_score: 1,
        max_score: 1,
        is_correct: true,
        requires_review: false,
        marking_source: "server"
      }))
    }
  });
  const markingWeek7 = signedInMarking(clientWeek7, unit3Resolver());
  await markingWeek7.markBlock({
    activityKey: "week7-session1-retrieval",
    activityVersion: "1.0.0",
    block: {
      id: "s1r-1",
      type: "short-response",
      content: { questionId: "week7-session1-retrieval:s1r-1" }
    },
    responses: { text: "answer" }
  });
  assert.equal(rpcPayload(clientWeek7).p_responses[0].question_id, "S1R1");
});

test("invalid resolver output is rejected before rpc", async () => {
  const client = fakeSupabase({ rpcs: { mark_formative_response: () => [] } });
  const marking = signedInMarking(client, async () => null);
  await assert.rejects(
    () => marking.markBlock({
      activityKey: "week2-malware-symptoms",
      activityVersion: "1.0.0",
      block: MALWARE_BLOCK,
      responses: { optionId: "a" }
    }),
    (error) => error instanceof PlatformError && error.code === "INVALID_FORMATIVE_CONTRACT"
  );
  assert.equal(client.calls.some((entry) => entry.type === "rpc"), false);
});
