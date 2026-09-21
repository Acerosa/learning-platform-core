import test from "node:test";
import assert from "node:assert/strict";
import { createAssignmentService } from "../../src/core/assignment/assignment-service.js";

test("getHubAssignments remembers the last snapshot for the same hub", async () => {
  const calls = [];
  const api = {
    getHubAssignments: async (hubCode) => {
      calls.push(hubCode);
      return [{ activity_key: "week-1" }];
    }
  };
  const assignments = createAssignmentService(api);
  assert.equal(assignments.getCachedHubAssignments("tlevel-software-development"), null);
  const first = await assignments.getHubAssignments("tlevel-software-development");
  const cached = assignments.getCachedHubAssignments("tlevel-software-development");
  assert.deepEqual(first, [{ activity_key: "week-1" }]);
  assert.deepEqual(cached, first);
  assert.equal(calls.length, 1);
});

test("empty hub assignment rows are still a reusable snapshot", async () => {
  const api = {
    getHubAssignments: async () => []
  };
  const assignments = createAssignmentService(api);
  await assignments.getHubAssignments("unit-3-cyber-security");
  assert.deepEqual(assignments.getCachedHubAssignments("unit-3-cyber-security"), []);
});

test("sign-out clears the hub assignment snapshot", async () => {
  const api = {
    getHubAssignments: async () => [{ activity_key: "week-1" }]
  };
  const assignments = createAssignmentService(api);
  await assignments.getHubAssignments("tlevel-software-development");
  assignments.clearHubAssignmentCache();
  assert.equal(assignments.getCachedHubAssignments("tlevel-software-development"), null);
});
