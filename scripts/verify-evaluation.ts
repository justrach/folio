import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../src/lib/eval-comparison";
import { EVAL_SUITE, WEBSITE_EVAL_VERSION, type EvaluationRun, type VerifiedEvaluation } from "../src/lib/evals";
import { parseWebsiteAgentOutput, verifyEvaluationResult } from "../src/lib/eval-verifier";

export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown, max: number, empty = false): value is string =>
  typeof value === "string" && value.length <= max && (empty || value.trim().length > 0);
const date = (value: unknown) => string(value, 64) && Number.isFinite(Date.parse(value));
const url = (value: unknown) => {
  if (!string(value, 2048)) return false;
  try { const parsed = new URL(value); return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password; }
  catch { return false; }
};
function requireShape(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Parse inert JSON only. Neither bundled instructions, HTML nor source URLs are executed. */
export async function verifyEvaluationBundleJson(raw: string): Promise<{
  runId: string; mode: "demo" | "live"; result: VerifiedEvaluation; notesChanged: boolean;
}> {
  requireShape(Buffer.byteLength(raw, "utf8") <= MAX_BUNDLE_BYTES, "Bundle exceeds the 5 MiB verification limit.");
  let bundle: unknown;
  try { bundle = JSON.parse(raw); } catch { throw new Error("Bundle must be valid JSON."); }
  requireShape(record(bundle), "Bundle must be an object.");
  const privateFormat = bundle.format === "folio-private-evaluation-bundle-v1";
  const localFormat = bundle.format === "folio-local-demo-evaluation-bundle-v1";
  const legacyLocalFormat = bundle.format === "folio-evidence-bundle";
  requireShape(privateFormat || localFormat || legacyLocalFormat, "Unsupported bundle format.");
  if (!legacyLocalFormat) {
    requireShape(bundle.publication === "private" && date(bundle.exportedAt), "Bundle must record private publication and a valid export time.");
  }
  requireShape(canonicalJson(bundle.suite) === canonicalJson(EVAL_SUITE), "Bundle suite differs from this verifier. Use the matching source-code version.");
  if (privateFormat) {
    requireShape(record(bundle.verification) && bundle.verification.hashAlgorithm === "SHA-256" &&
      bundle.verification.hashEncoding === "UTF-8 encoding of capture.content, without text normalization",
    "Unsupported source hashing metadata.");
  }
  const run = bundle.run;
  requireShape(record(run), "Bundle has no evaluation run.");
  requireShape(string(run.id, 128) && url(run.targetUrl) && string(run.siteName, 300) &&
    run.suiteVersion === WEBSITE_EVAL_VERSION && run.publication === "private" &&
    (run.mode === "demo" || run.mode === "live") && run.status === "completed" &&
    date(run.createdAt) && date(run.updatedAt) && Number.isSafeInteger(run.revision) && Number(run.revision) >= 0,
  "Invalid run identity, version, completion status or privacy metadata.");
  requireShape(Array.isArray(run.captures) && run.captures.length > 0 && run.captures.length <= 20, "Expected 1–20 frozen source captures.");
  for (const capture of run.captures) {
    requireShape(record(capture) && string(capture.id, 128) && url(capture.url) && date(capture.capturedAt) &&
      string(capture.content, 1_000_000, true) && string(capture.sha256, 64) && /^[a-f0-9]{64}$/.test(capture.sha256) &&
      (capture.kind === "page" || capture.kind === "technical-check" || capture.kind === "seo-report") &&
      capture.hashEncoding === "utf8-text-v1" &&
      capture.transport === (run.mode === "demo" ? "fixture" : "http"), "Invalid source capture shape, hash encoding or declared provenance.");
  }
  requireShape(new Set(run.captures.map(capture => capture.id)).size === run.captures.length, "Source capture IDs must be unique.");
  if (run.mode === "demo") {
    requireShape(run.sessionId === null && run.model === null, "A local demo must not claim an OpenAI session or model.");
  } else {
    requireShape(privateFormat && string(run.sessionId, 200) && string(run.model, 200), "Live runs require the private format and a declared provider session and model.");
  }
  if (run.expectedFacts !== undefined) {
    const facts = run.expectedFacts;
    requireShape(record(facts) && facts.source === (run.mode === "demo" ? "fixture" : "owner-confirmed"), "Reference fact provenance does not match the run mode.");
    requireShape(facts.productName === undefined || string(facts.productName, 200), "Invalid expected product name.");
    if (facts.pricing !== undefined && facts.pricing !== null) {
      const pricing = facts.pricing;
      requireShape(record(pricing) && typeof pricing.amount === "number" && Number.isFinite(pricing.amount) && pricing.amount >= 0 &&
        string(pricing.currency, 3) && /^[A-Z]{3}$/.test(pricing.currency) && string(pricing.interval, 40), "Invalid expected pricing facts.");
    }
  }
  requireShape(Array.isArray(run.events) && run.events.length <= 1000 && (run.usage === null || record(run.usage)) &&
    (run.error === null || string(run.error, 4000)) && record(run.result), "Invalid saved run metadata or missing verification result.");
  requireShape(Array.isArray(run.result.checks) && run.result.checks.length <= 100 && run.result.checks.every(check =>
    record(check) && string(check.id, 128) && ["pass", "fail", "unmeasured"].includes(String(check.status)) &&
    string(check.expected, 10000, true) && string(check.actual, 10000, true) && Array.isArray(check.evidenceIds) &&
    check.evidenceIds.every(id => string(id, 128))), "Invalid saved verification check shape.");
  requireShape(parseWebsiteAgentOutput(run.agentOutput), "The saved agent output does not match the website-evidence-v1 schema.");
  const validRun = run as unknown as EvaluationRun;
  const result = await verifyEvaluationResult(validRun, validRun.agentOutput);
  requireShape(result.checks.find(check => check.id === "source-integrity")?.status === "pass", "Source integrity failed: at least one capture changed after hashing.");
  // Explanatory prose can be corrected without changing the frozen checks. Never silently
  // accept changed observations, expected values, outcomes, citations or agent findings.
  const outcomes = (value: VerifiedEvaluation) => ({
    summary: value.summary, passed: value.passed, failed: value.failed, unmeasured: value.unmeasured,
    measured: value.measured, verificationScore: value.verificationScore, findings: value.findings,
    citations: value.citations,
    checks: value.checks.map(({ id, status, expected, actual, evidenceIds }) => ({ id, status, expected, actual, evidenceIds })),
  });
  requireShape(canonicalJson(outcomes(result)) === canonicalJson(outcomes(validRun.result!)), "Saved verification outcomes differ from the recomputed result; check the source-code version or whether the file was altered.");
  const notesChanged = canonicalJson(result) !== canonicalJson(run.result);
  return { runId: validRun.id, mode: validRun.mode, result, notesChanged };
}

async function main() {
  if (process.argv.length !== 3) throw new Error("Usage: bun run eval:verify /path/to/folio-evaluation.json");
  const handle = await open(resolve(process.argv[2]), "r");
  let raw: string;
  try {
    const info = await handle.stat();
    requireShape(info.isFile() && info.size <= MAX_BUNDLE_BYTES, "Choose a regular JSON file no larger than 5 MiB.");
    const buffer = Buffer.alloc(MAX_BUNDLE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    requireShape(size <= MAX_BUNDLE_BYTES, "Bundle exceeds the 5 MiB verification limit.");
    raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
  } finally { await handle.close(); }
  const { mode, result, notesChanged } = await verifyEvaluationBundleJson(raw);
  process.stdout.write(`Reproduced ${mode === "demo" ? "local demo" : "private live run"}: ${result.passed} passed, ${result.failed} failed, ${result.unmeasured} unmeasured checks.\nSource hashes and saved verification outcomes match. No network requests were made.\n${notesChanged ? "Explanatory labels, details or limitations differ; review the verifier source-code version.\n" : ""}This checks internal consistency, not website truth, capture timestamps, or provider authenticity.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`Verification failed: ${error instanceof Error ? error.message : "Unknown bundle error."}\n`);
    process.exitCode = 1;
  });
}
