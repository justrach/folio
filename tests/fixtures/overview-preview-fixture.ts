/**
 * TEST-ONLY ILLUSTRATIVE FIXTURE for the private overview. Used by browser specs
 * and the local preview proxy (scripts/overview-fixture-preview.ts). It is never
 * imported by application code and contains no real account or provider data.
 */
import type { KeywordBenchmarkRun, KeywordBenchmarkSuite } from "../../src/lib/keyword-benchmark-types";

export const FIXTURE_SITE = { id: "site-example", name: "Example fixture", url: "https://example-fixture.dev/" };
const QUERIES = ["Which tool explains a codebase?", "Best code search for monorepos", "How do I map service dependencies?", "Tools to find function callers", "Codebase onboarding for new engineers", "Open source code intelligence tools"];
const SOURCES = ["https://docs.alpha-fixture.dev/a", "https://beta-fixture.dev/b", "https://gamma-fixture.dev/c", "https://alpha-fixture.dev/d"];

export type FixtureResponse = { status: number; json: unknown };

export function overviewFixture(base: number) {
  const iso = (daysAgo: number, hoursAgo = 0) => new Date(base - daysAgo * 86_400_000 - hoursAgo * 3_600_000).toISOString();
  const suite: KeywordBenchmarkSuite = { id: "suite-viz", name: "Fixture questions", description: "Browser fixture only", createdAt: iso(80),
    cases: QUERIES.map((query, index) => ({ id: `q-${index}`, query, targetUrl: FIXTURE_SITE.url, searchMode: "open-web" as const, suiteId: "suite-viz", revision: 0,
      createdAt: iso(80), updatedAt: iso(80), language: "en", locale: "US", rubricVersion: "fixture" })) };
  function run(id: string, index: number, daysAgo: number, present: boolean | null, status: KeywordBenchmarkRun["status"] = "completed"): KeywordBenchmarkRun {
    const item = suite.cases[index]; const time = iso(daysAgo, index);
    const cites = [SOURCES[index % 4], SOURCES[(index + 1) % 4], ...(present ? [item.targetUrl!] : [])];
    return { id, suiteId: suite.id, caseId: item.id, case: item, kind: "baseline", baselineRunId: null, surface: "openai-managed-agents", publication: "private",
      model: "fixture-model", harnessVersion: "fixture-harness", environmentType: "none", environmentFingerprint: "fixture-settings", status,
      sessionId: "fixture-session", createAttemptAt: time, deadlineAt: time, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [],
      createdAt: time, updatedAt: time, revision: 1,
      answer: status !== "completed" ? null : { text: "Fixture answer", mentions: [{ name: "Other fixture", url: "https://beta-fixture.dev/" },
        ...(present === null ? [{ name: "Unlinked fixture", url: "" }] : present ? [{ name: "Target fixture", url: item.targetUrl! }] : [])],
        citations: cites.map(url => ({ url, title: "Fixture source" })), limitations: ["Illustrative test data"] },
      usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null };
  }
  const runs: KeywordBenchmarkRun[] = [
    run("r0", 0, 1, true), run("r1", 1, 2, false), run("r2", 2, 3, true), run("r3", 3, 9, null),
    run("r4", 4, 0, null, "failed"), run("r4-old", 4, 12, false),
    ...Array.from({ length: 14 }, (_, i) => run(`h${i}`, i % 4, 14 + i * 4, i % 2 === 0)),
  ];
  const scans = [[40, 61], [26, 66], [12, 72], [2, 69]].map(([daysAgo, seoScore], i) => ({ id: `scan-${i}`, url: FIXTURE_SITE.url, createdAt: iso(daysAgo), seoScore, checks: [], patches: [], title: "Fixture", description: "Fixture", wordCount: 10 }));
  const user = { id: "fixture", name: "Fixture owner", email: "owner@example.test", emailVerified: true, createdAt: iso(90), updatedAt: iso(90) };

  function respond(method: string, path: string, options: { failRuns?: boolean } = {}): FixtureResponse {
    if (path === "/api/auth/get-session") return { status: 200, json: { user, session: { id: "s", userId: "fixture", token: "fixture", expiresAt: "2099-01-01T00:00:00Z" } } };
    if (method !== "GET") return { status: 409, json: { error: "Fixture prohibits writes" } };
    if (path === "/api/sites") return { status: 200, json: { sites: [{ ...FIXTURE_SITE, isPublic: false, seoScore: scans.at(-1)?.seoScore ?? null }] } };
    if (path === "/api/benchmarks") return { status: 200, json: { suites: [{ ...suite, cases: undefined, caseCount: suite.cases.length }] } };
    if (path === `/api/benchmarks/${suite.id}`) return { status: 200, json: { suite } };
    if (path === "/api/benchmarks/runs") {
      if (options.failRuns) return { status: 503, json: { error: "Fixture failure" } };
      const sorted = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { status: 200, json: { runs: sorted.map(({ answer, ...value }) => ({ ...value, mentionCount: answer?.mentions.length ?? 0, citationCount: answer?.citations.length ?? 0, answerCharacters: 0 })), models: ["fixture-model"], nextCursor: null } };
    }
    if (path.startsWith("/api/benchmarks/runs/")) { const found = runs.find(item => path.endsWith(`/${item.id}`)); return found ? { status: 200, json: { run: found } } : { status: 404, json: { error: "Not found" } }; }
    if (path === "/api/scans") return { status: 200, json: { scans } };
    if (path === "/api/evaluations") return { status: 200, json: { runs: [] } };
    if (path === "/api/agents/status") return { status: 200, json: { configured: false, authorized: false, canRun: false, message: "Fixture" } };
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return { status: 200, json: { reports: [] } };
    return { status: 404, json: { error: "Unavailable in browser fixture" } };
  }
  return { suite, runs, scans, respond };
}
