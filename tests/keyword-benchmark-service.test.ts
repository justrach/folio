import assert from "node:assert/strict";
import test from "node:test";
import { keywordBenchmarkAccess } from "../src/lib/keyword-benchmark-service";
import { keywordBenchmarkErrorResponse, requireKeywordBenchmarkOrigin } from "../src/lib/keyword-benchmark-api";
import { KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";
import { KeywordAgentError } from "../src/lib/keyword-benchmark-agent";

test("benchmark access preserves exact owner approval and separate bounded limits", () => {
  const env = { OPENAI_API_KEY: "fixture-not-a-real-key", OPENAI_ALLOWED_USER_IDS: "alice, bob", OPENAI_MAX_RUNS_PER_DAY: "999" };
  assert.equal(keywordBenchmarkAccess(env, "alice").canRun, true);
  assert.equal(keywordBenchmarkAccess(env, "ali").canRun, false);
  assert.equal(keywordBenchmarkAccess(env, "").canRun, false);
  assert.equal(keywordBenchmarkAccess({ ...env, OPENAI_API_KEY: "" }, "alice").canRun, false);
  assert.equal(keywordBenchmarkAccess(env, "alice").maxRunsPerDay, 6);
  assert.equal(keywordBenchmarkAccess(env, "alice").maxActiveRuns, 1);
  assert.equal(JSON.stringify(keywordBenchmarkAccess(env, "alice")).includes(env.OPENAI_API_KEY), false);
  const exempt = { ...env, OPENAI_UNMETERED_USER_IDS: "alice" };
  assert.equal(keywordBenchmarkAccess(exempt, "alice").maxRunsPerDay, null);
  assert.equal(keywordBenchmarkAccess(exempt, "alice").maxActiveRuns, 1);
  assert.equal(keywordBenchmarkAccess(exempt, "bob").maxRunsPerDay, 6);
  assert.equal(keywordBenchmarkAccess({ ...exempt, OPENAI_UNMETERED_USER_IDS: "alice-longer" }, "alice").maxRunsPerDay, 6);
  assert.equal(keywordBenchmarkAccess({ ...exempt, OPENAI_ALLOWED_USER_IDS: "bob" }, "alice").canRun, false);
});
test("benchmark mutations require the configured app origin and responses do not leak upstream errors", async () => {
  const request = (origin?: string) => new Request("http://localhost:3001/api/benchmarks/runs", { method: "POST", headers: origin ? { origin } : undefined });
  assert.doesNotThrow(() => requireKeywordBenchmarkOrigin(request("http://localhost:3001"), "http://localhost:3001"));
  for (const origin of [undefined, "https://attacker.example", "http://localhost:3002"])
    assert.throws(() => requireKeywordBenchmarkOrigin(request(origin), "http://localhost:3001"), error => error instanceof KeywordBenchmarkStoreError && error.status === 403);
  for (const error of [new Error("PRIVATE_TOKEN"), new KeywordAgentError("PRIVATE_TOKEN", "UPSTREAM_ERROR", true, 502)]) {
    const response = keywordBenchmarkErrorResponse(error);
    assert.ok(response.status >= 500); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.text()).includes("PRIVATE_TOKEN"), false);
  }
});
