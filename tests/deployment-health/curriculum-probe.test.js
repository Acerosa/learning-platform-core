import assert from "node:assert/strict";
import test from "node:test";
import { probePublishedCurriculum } from "../../src/deployment-health/curriculum-probe.js";

test("curriculum probe validates expected package version", async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [{
        package_version: "0.4.47",
        package: { version: "0.4.47", activities: new Array(10).fill({}) }
      }];
    }
  });

  const ok = await probePublishedCurriculum({
    curriculum: {
      hubCode: "tlevel-software-development",
      courseKey: "t-level-digital-software-development",
      expectedPackageVersion: "0.4.47",
      minActivityCount: 5,
      supabaseUrl: "https://example.supabase.co"
    }
  }, { fetch: fetchFn, publishableKey: "test-key" });

  assert.equal(ok.results.every((item) => item.passed), true);

  const bad = await probePublishedCurriculum({
    curriculum: {
      hubCode: "tlevel-software-development",
      courseKey: "t-level-digital-software-development",
      expectedPackageVersion: "9.9.9",
      supabaseUrl: "https://example.supabase.co"
    }
  }, { fetch: fetchFn, publishableKey: "test-key" });

  assert.equal(bad.results.find((item) => item.id === "curriculum.version").passed, false);
});

test("curriculum probe fails closed when RPC returns empty package", async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [];
    }
  });
  const outcome = await probePublishedCurriculum({
    curriculum: {
      hubCode: "unit-3-cyber-security",
      courseKey: "ocr-level-3-it",
      supabaseUrl: "https://example.supabase.co"
    }
  }, { fetch: fetchFn, publishableKey: "test-key" });
  assert.equal(outcome.results.find((item) => item.id === "curriculum.retrieval").passed, false);
});
