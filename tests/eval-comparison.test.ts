import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalJson, compareEvaluationRuns } from "../src/lib/eval-comparison";
import { EVAL_SUITE, type EvaluationRun, type WebsiteAgentOutput } from "../src/lib/evals";
import { createDemoEvaluationRun, sha256Source, verifyEvaluationResult } from "../src/lib/eval-verifier";
import { MAX_BUNDLE_BYTES, verifyEvaluationBundleJson } from "../scripts/verify-evaluation";

function bundle(run: EvaluationRun, format = "folio-private-evaluation-bundle-v1") {
  return {
    format, exportedAt: new Date().toISOString(), publication: "private", suite: EVAL_SUITE,
    verification: { hashAlgorithm: "SHA-256", hashEncoding: "UTF-8 encoding of capture.content, without text normalization" }, run,
  };
}

/** Synthetic saved provider evidence; no DataForSEO or OpenAI request is made. */
async function savedSeoBundleRun(): Promise<EvaluationRun> {
  const run = await createDemoEvaluationRun();
  run.mode = "live";
  run.model = "test-provider-model";
  run.sessionId = "test-session-with-saved-seo";
  run.captures[0].transport = "http";
  run.expectedFacts!.source = "owner-confirmed";
  const report = {
    id: "report_fixture", domain: new URL(run.targetUrl).hostname,
    createdAt: run.createdAt, retrievedAt: run.createdAt, publication: "private", state: "complete",
    result: {
      id: "lookup_fixture", domain: new URL(run.targetUrl).hostname, provider: "DataForSEO", fetchedAt: run.createdAt,
      organic: { status: "empty", data: null, costUsd: 0.01 },
      backlinks: { status: "success", data: { backlinks: 160, referringDomains: 64 }, costUsd: null },
      status: "partial", totalCostUsd: null, knownCostUsd: 0.01, costIsComplete: false, notes: [],
    },
  };
  const content = JSON.stringify(report);
  const evidenceId = `seo-report:${report.id}`;
  run.captures.push({ id: evidenceId, url: run.targetUrl, capturedAt: report.retrievedAt,
    kind: "seo-report", transport: "http", hashEncoding: "utf8-text-v1", content, sha256: await sha256Source(content) });
  const output = run.agentOutput as WebsiteAgentOutput;
  output.citations.push({ field: "finding", evidenceId, quote: '"backlinks":160,"referringDomains":64' });
  output.findings.push({ dimension: "saved-seo-context", status: "supported", evidenceIds: [evidenceId],
    explanation: "The saved report contains 160 backlinks from 64 referring domains.",
    recommendation: "Review the referring domains alongside the captured website." });
  run.result = await verifyEvaluationResult(run, output);
  return run;
}

test("offline verification reproduces private and explicitly local export formats without a network", async () => {
  const run = await createDemoEvaluationRun();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Offline verification attempted a network request."); };
  try {
    for (const format of ["folio-private-evaluation-bundle-v1", "folio-local-demo-evaluation-bundle-v1", "folio-evidence-bundle"]) {
      const value = await verifyEvaluationBundleJson(JSON.stringify(bundle(run, format)));
      assert.equal(value.mode, "demo");
      assert.deepEqual(value.result, run.result);
    }
  } finally { globalThis.fetch = previousFetch; }
});

test("offline verification reproduces a private run with cited saved SEO evidence without a network", async t => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Offline verification attempted a network request."); });
  const run = await savedSeoBundleRun();
  const value = await verifyEvaluationBundleJson(JSON.stringify(bundle(run)));
  assert.equal(value.mode, "live");
  assert.deepEqual(value.result, run.result);
  assert.equal(value.result.checks.find(check => check.id === "source-integrity")?.actual, "2/2 hashes match; IDs unique.");
  assert.equal(value.result.checks.find(check => check.id === "citation-integrity")?.actual, "4/4 citations resolve to exact source text.");
  assert.equal(value.result.checks.find(check => check.id === "finding-evidence")?.status, "pass");
  assert.equal(value.notesChanged, false);
});

test("offline verification rejects corrupted saved SEO evidence even if its hash is replaced", async () => {
  const run = await savedSeoBundleRun();
  const capture = run.captures.find(source => source.kind === "seo-report")!;
  capture.content = capture.content.replace('"backlinks":160', '"backlinks":9999');
  await assert.rejects(verifyEvaluationBundleJson(JSON.stringify(bundle(run))), /integrity failed/);
  capture.sha256 = await sha256Source(capture.content);
  await assert.rejects(verifyEvaluationBundleJson(JSON.stringify(bundle(run))), /outcomes differ/);
});

test("offline verification rejects changed capture contents and a changed saved result", async () => {
  const run = await createDemoEvaluationRun();
  const changedSource = structuredClone(run);
  changedSource.captures[0].content += "<p>A changed source</p>";
  await assert.rejects(verifyEvaluationBundleJson(JSON.stringify(bundle(changedSource))), /integrity failed/);
  const changedResult = structuredClone(run);
  changedResult.result!.checks[0].actual = "A different recorded observation";
  await assert.rejects(verifyEvaluationBundleJson(JSON.stringify(bundle(changedResult))), /outcomes differ/);
  const changedOutput = structuredClone(run);
  (changedOutput.agentOutput as { summary: string }).summary = "An altered agent conclusion";
  await assert.rejects(verifyEvaluationBundleJson(JSON.stringify(bundle(changedOutput))), /outcomes differ/);
});

test("explanatory prose revisions are reported separately from reproducible verification outcomes", async () => {
  const run = await createDemoEvaluationRun();
  run.result!.checks[0].detail = "An earlier explanation of the same frozen check.";
  const verified = await verifyEvaluationBundleJson(JSON.stringify(bundle(run)));
  assert.equal(verified.notesChanged, true);
  assert.equal(verified.result.verificationScore, run.result!.verificationScore);
});

test("offline bundle validation rejects incompatible suites, malformed shape and unsafe provenance", async () => {
  const original = bundle(await createDemoEvaluationRun());
  const invalid: unknown[] = [
    { ...original, format: "another-format" },
    { ...original, suite: { ...EVAL_SUITE, version: "website-evidence-v2" } },
    { ...original, publication: "public" },
    { ...original, run: { ...original.run, captures: "not an array" } },
    { ...original, run: { ...original.run, status: "running" } },
    { ...original, run: { ...original.run, sessionId: "claimed-real-session" } },
    { ...original, run: { ...original.run, captures: [{ ...original.run.captures[0], transport: "http" }] } },
    { ...original, run: { ...original.run, captures: [{ ...original.run.captures[0], kind: "unknown-report" }] } },
    { ...original, run: { ...original.run, captures: [{ ...original.run.captures[0], url: "javascript:alert(1)" }] } },
    { ...original, run: { ...original.run, expectedFacts: { source: "owner-confirmed", pricing: null } } },
  ];
  for (const value of invalid) await assert.rejects(verifyEvaluationBundleJson(JSON.stringify(value)));
  await assert.rejects(verifyEvaluationBundleJson("{"), /valid JSON/);
  await assert.rejects(verifyEvaluationBundleJson(" ".repeat(MAX_BUNDLE_BYTES + 1)), /5 MiB/);
});

test("live bundles require provider metadata and cannot masquerade as local exports", async () => {
  const run = await createDemoEvaluationRun();
  run.mode = "live";
  run.model = "test-provider-model";
  run.sessionId = "test-session";
  run.captures[0].transport = "http";
  run.expectedFacts!.source = "owner-confirmed";
  run.result = await verifyEvaluationResult(run, run.agentOutput);
  assert.equal((await verifyEvaluationBundleJson(JSON.stringify(bundle(run)))).mode, "live");
  await assert.rejects(verifyEvaluationBundleJson(JSON.stringify(bundle(run, "folio-evidence-bundle"))), /Live runs/);
  run.expectedFacts!.source = "fixture";
  await assert.rejects(verifyEvaluationBundleJson(JSON.stringify(bundle(run))), /provenance/);
});

test("a reproduced failure stays a failure, while object property order is ignored", async () => {
  const run = await createDemoEvaluationRun();
  run.expectedFacts!.productName = "An independently expected other product";
  run.result = await verifyEvaluationResult(run, run.agentOutput);
  assert.ok(run.result.failed > 0);
  const value = bundle(run);
  value.run.result = Object.fromEntries(Object.entries(run.result).reverse()) as typeof run.result;
  const verified = await verifyEvaluationBundleJson(JSON.stringify(value));
  assert.equal(verified.result.failed, run.result.failed);
});

test("offline CLI exits nonzero for tampering and zero for a consistent fixture", async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-verifier-"));
  const filename = join(directory, "evidence.json");
  try {
    const run = await createDemoEvaluationRun();
    await writeFile(filename, JSON.stringify(bundle(run)), { mode: 0o600 });
    const valid = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-evaluation.ts", filename], { encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /No network requests were made/);
    run.result!.verificationScore = 99;
    await writeFile(filename, JSON.stringify(bundle(run)));
    const invalid = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-evaluation.ts", filename], { encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /outcomes differ/);
    assert.ok(!invalid.stderr.includes(run.captures[0].content));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("same-suite fixed-evidence run comparison exposes check transitions", async () => {
  const before = await createDemoEvaluationRun();
  const after = structuredClone(before);
  after.id = "after";
  before.expectedFacts!.productName = "Different expected product";
  after.expectedFacts = structuredClone(before.expectedFacts);
  before.result = await verifyEvaluationResult(before, before.agentOutput);
  (after.agentOutput as { facts: { productName: string } }).facts.productName = "Different expected product";
  after.result = await verifyEvaluationResult(after, after.agentOutput);
  const comparison = compareEvaluationRuns(before, after);
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.sourceHashesChanged, false);
  assert.equal(comparison.referenceFactsChanged, false);
  assert.equal(comparison.checks.find(check => check.id === "product-understanding")?.change, "improved");
  assert.equal(comparison.scoreDelta, 12);
});

test("changed measurement coverage suppresses aggregate deltas", async () => {
  const before = await createDemoEvaluationRun();
  const after = structuredClone(before);
  delete after.expectedFacts;
  after.result = await verifyEvaluationResult(after, after.agentOutput);
  const comparison = compareEvaluationRuns(before, after);
  assert.equal(comparison.coverageChanged, true);
  assert.equal(comparison.referenceFactsChanged, true);
  assert.equal(comparison.comparable, false);
  assert.equal(comparison.scoreDelta, null);
  assert.equal(comparison.checks.find(check => check.id === "product-understanding")?.change, "coverage changed");
});

test("capture hash, reference answer, model and suite changes are independently reported", async () => {
  const before = await createDemoEvaluationRun();
  const after = structuredClone(before);
  after.captures[0].content += "<p>Changed source</p>";
  after.captures[0].sha256 = await sha256Source(after.captures[0].content);
  after.expectedFacts!.pricing = { amount: 79, currency: "USD", interval: "month" };
  after.model = "a-different-model";
  after.suiteVersion = "website-evidence-v2";
  after.result = await verifyEvaluationResult(after, after.agentOutput);
  const comparison = compareEvaluationRuns(before, after);
  assert.equal(comparison.sourceHashesChanged, true);
  assert.equal(comparison.referenceFactsChanged, true);
  assert.equal(comparison.modelChanged, true);
  assert.equal(comparison.suiteChanged, true);
  assert.equal(comparison.scoreDelta, null);
});

test("comparison rejects mixed fixture/live provenance and unfinished or duplicate-check results", async () => {
  const before = await createDemoEvaluationRun();
  const after = structuredClone(before);
  after.mode = "live";
  assert.throws(() => compareEvaluationRuns(before, after), /cannot be compared together/);
  after.mode = "demo";
  after.status = "running";
  assert.throws(() => compareEvaluationRuns(before, after), /completed/);
  after.status = "completed";
  after.result!.checks.push(after.result!.checks[0]);
  assert.throws(() => compareEvaluationRuns(before, after), /duplicate check IDs/);
});

test("added or removed suite checks are coverage changes even when aggregate counts happen to match", async () => {
  const before = await createDemoEvaluationRun();
  const after = structuredClone(before);
  after.result!.checks[0].id = "replacement-check";
  const comparison = compareEvaluationRuns(before, after);
  assert.equal(comparison.coverageChanged, true);
  assert.equal(comparison.scoreDelta, null);
  assert.equal(comparison.checks.find(check => check.id === "source-integrity")?.change, "check removed");
  assert.equal(comparison.checks.find(check => check.id === "replacement-check")?.change, "check added");
  assert.equal(canonicalJson({ z: 1, a: 2 }), canonicalJson({ a: 2, z: 1 }));
});
