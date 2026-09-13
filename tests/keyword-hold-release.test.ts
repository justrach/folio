import assert from "node:assert/strict";
import test from "node:test";
import { parseKeywordBenchmarkCli } from "../scripts/keyword-benchmark";
import { isKeywordBenchmarkBlocking } from "../src/lib/keyword-benchmark-types";

test("hold CLI requires exact owner/run/revision and an explicit unknown-cost acknowledgement only for release", () => {
  const args = ["--owner-id", "fixture-owner", "--run-id", "fixture-run", "--revision", "2"];
  assert.equal(parseKeywordBenchmarkCli(["hold-preview", ...args]).command, "hold-preview");
  assert.equal(parseKeywordBenchmarkCli(["release-hold", ...args, "--acknowledge-unknown-cost"]).options.get("revision"), "2");
  assert.throws(() => parseKeywordBenchmarkCli(["release-hold", ...args]), /acknowledge-unknown-cost/);
  assert.throws(() => parseKeywordBenchmarkCli(["hold-preview", ...args, "--acknowledge-unknown-cost"]), /only to release-hold/);
  assert.throws(() => parseKeywordBenchmarkCli(["release-hold", ...args, "--acknowledge-unknown-cost", "--confirm-spend"]), /only to start/);
  for (const value of ["-1", "1.5", "1e3", "01", "NaN", "9007199254740992"])
    assert.throws(() => parseKeywordBenchmarkCli(["hold-preview", "--owner-id", "fixture-owner", "--run-id", "fixture-run", "--revision", value]));
  for (const extra of [["--case-id", "another-case"], ["--revision", "3"], ["--wait"]])
    assert.throws(() => parseKeywordBenchmarkCli(["hold-preview", ...args, ...extra]));
  assert.throws(() => parseKeywordBenchmarkCli(["release-hold", ...args, "--acknowledge-unknown-cost", "--acknowledge-unknown-cost"]), /Duplicate/);
});

test("only an explicitly released unresolved creation stops consuming cross-case active capacity", () => {
  const unknown = { status: "requires_action" as const, sessionId: null, createAttemptAt: "2026-09-13T00:00:00.000Z" };
  assert.equal(isKeywordBenchmarkBlocking(unknown), true);
  assert.equal(isKeywordBenchmarkBlocking({ ...unknown, holdReleasedAt: "2026-09-13T00:01:00.000Z" }), false);
  assert.equal(isKeywordBenchmarkBlocking({ ...unknown, holdReleasedAt: "2026-09-13T00:01:00.000Z", sessionId: "recovered-session" }), true);
  assert.equal(isKeywordBenchmarkBlocking({ ...unknown, holdReleasedAt: "2026-09-13T00:01:00.000Z", createAttemptAt: null }), true);
  assert.equal(isKeywordBenchmarkBlocking({ ...unknown, status: "running", holdReleasedAt: "2026-09-13T00:01:00.000Z" }), true);
  assert.equal(isKeywordBenchmarkBlocking({ ...unknown, status: "completed" }), false);
});
