import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeWebsiteSnapshots } from "../src/lib/website-comparison";
import type { KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";

const base = {
  suiteId: "suite",
  caseId: "case",
  kind: "baseline",
  baselineRunId: null,
  surface: "openai-managed-agents",
  publication: "private",
  model: "fixture-model",
  harnessVersion: "fixture-harness",
  environmentType: "none",
  environmentFingerprint: "fixture-settings",
  sessionId: "session",
  createAttemptAt: "2026-09-13T08:00:00.000Z",
  deadlineAt: null,
  cancelAttemptAt: null,
  cancelAcknowledgedAt: null,
  allowedDomains: [],
  updatedAt: "2026-09-13T08:00:00.000Z",
  revision: 1,
  usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
  providerMetadata: { environmentId: null, requestId: null, turnId: null },
  error: null,
} as const;

function run(overrides: Partial<KeywordBenchmarkRun> & { id: string; createdAt: string }): KeywordBenchmarkRun {
  return { ...base, ...overrides } as KeywordBenchmarkRun;
}

const answered = (targetUrl: string, names: (string | null)[]) => ({
  text: "saved",
  mentions: names.map((url, index) => ({ name: `Site ${index}`, url })),
  citations: [{ url: targetUrl }],
});

describe("summarizeWebsiteSnapshots", () => {
  it("uses the latest completed answer per question and excludes unknown identities", () => {
    const target = "https://alpha-fixture.dev/";
    const rows = summarizeWebsiteSnapshots([
      {
        site: { id: "alpha", url: target },
        runs: [
          run({
            id: "old",
            createdAt: "2026-09-12T08:00:00.000Z",
            status: "completed",
            case: { query: "q", targetUrl: target, language: "en", locale: "US", rubricVersion: "v1" },
            answer: answered(target, [target]),
          }),
          run({
            id: "new",
            createdAt: "2026-09-13T08:00:00.000Z",
            status: "completed",
            case: { query: "q", targetUrl: target, language: "en", locale: "US", rubricVersion: "v1" },
            answer: answered(target, ["https://other-fixture.dev/"]),
          }),
          run({
            id: "unknown",
            createdAt: "2026-09-13T09:00:00.000Z",
            status: "completed",
            case: { query: "other", targetUrl: target, language: "en", locale: "US", rubricVersion: "v1" },
            answer: answered(target, [null]),
          }),
          run({
            id: "pending",
            createdAt: "2026-09-14T08:00:00.000Z",
            status: "running",
            case: { query: "q", targetUrl: target, language: "en", locale: "US", rubricVersion: "v1" },
            answer: null,
          }),
        ],
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].answered, 2);
    assert.equal(rows[0].identified, 1);
    assert.equal(rows[0].appeared, 0);
    assert.equal(rows[0].unknown, 1);
    assert.equal(rows[0].appearanceRate, 0);
    assert.equal(rows[0].sourceCount, 1);
  });

  it("returns null rate when no identity is known", () => {
    const rows = summarizeWebsiteSnapshots([{ site: { id: "empty", url: "https://empty-fixture.dev/" }, runs: [] }]);
    assert.equal(rows[0].appearanceRate, null);
    assert.equal(rows[0].answered, 0);
  });
});
