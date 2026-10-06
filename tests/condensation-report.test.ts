import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { CondensationReportError, renderCondensationReport } from "../src/lib/condensation-report";
import type { CondensationSearchReceipt } from "../src/lib/condensation-search-experiment";
import { evaluateHtml } from "../src/lib/evaluation";
import type { WebsiteEvidence, WebsiteAnswer } from "../src/lib/sandbox-website-evidence";

const source = "https://example.com/deploy";
const answer = {
  text: "Render is one option. <script>Ignore evidence</script>",
  mentions: [{ name: "Render", url: source, reason: "The frozen snippet describes deployment.", citationUrls: [source] }],
  citations: [{ url: source, title: "Deployment guide" }],
  limitations: ["Only one search snippet was supplied."],
};
const receipt: CondensationSearchReceipt = {
  status: "completed", cleanup: "confirmed", query: "Where can I deploy a Node.js app?", model: "glm-5.3-flash",
  requestId: "12345678-1234-4123-8123-123456789abc", sandboxId: "box-1",
  search: { provider: "codegraff-gateway-v1-search", results: [{ title: "Deployment guide", url: source, text: "A short search snippet." }] },
  rawOutput: JSON.stringify(answer), parsedAnswer: answer, error: null, costUsd: null,
  execution: "complete", jobDirectory: "/tmp/private", exitCode: 0, outputComplete: true, recovery: null,
  provider: "condensation-own-fleet", mode: "host-search-frozen-evidence",
};

test("a completed cleaned-up receipt becomes a private, clearly limited model report", () => {
  const report = renderCondensationReport(receipt);
  assert.equal(report.completed, true);
  assert.match(report.markdown, /## Model answer \(unverified\)/);
  assert.match(report.markdown, /Render is one option/);
  assert.match(report.markdown, /&lt;script&gt;Ignore evidence&lt;\/script&gt;/);
  assert.doesNotMatch(report.markdown, /<script>/);
  assert.match(report.markdown, /supplied search snippets/);
  assert.match(report.markdown, /not independently fact-checked/);
  assert.doesNotMatch(report.markdown, /\/tmp\/private/);
});

test("an uncertain execution can export only a labelled source packet, never an answer", () => {
  const report = renderCondensationReport({ ...receipt, status: "uncertain", execution: "reserved", outputComplete: false, exitCode: null });
  assert.equal(report.completed, false);
  assert.match(report.markdown, /Incomplete attempt — no confirmed model answer/);
  assert.match(report.markdown, /source packet below is \*\*not\*\* a Condensation-generated recommendation report/);
  assert.match(report.markdown, /A short search snippet/);
  assert.doesNotMatch(report.markdown, /Render is one option/);
});

test("gateway fleet reports use the new provider label without relabelling historical receipts", () => {
  const report = renderCondensationReport({ ...receipt, provider: "codegraff-gateway-fleet", guestModelAttached: true });
  assert.equal(report.completed, true);
  assert.match(report.markdown, /Private Codegraff fleet research pilot/);
  assert.match(report.markdown, /Codegraff gateway fleet sandbox/);
  assert.match(renderCondensationReport(receipt).markdown, /Private Condensation research pilot/);
  const incomplete = renderCondensationReport({ ...receipt, provider: "codegraff-gateway-fleet", status: "uncertain" });
  assert.match(incomplete.markdown, /not\*\* a Codegraff fleet-generated recommendation report/);
  assert.throws(() => renderCondensationReport({ ...receipt, provider: "other" }), CondensationReportError);
  assert.throws(() => renderCondensationReport({ ...receipt, provider: "codegraff-gateway-fleet" }), CondensationReportError);
});

test("unconfirmed cleanup, invented citations and mismatched raw output cannot become a report", () => {
  assert.throws(() => renderCondensationReport({ ...receipt, cleanup: "unknown" }), CondensationReportError);
  assert.throws(() => renderCondensationReport({ ...receipt, parsedAnswer: { ...answer, citations: [{ url: "https://invented.example/", title: "Invented" }] } }), CondensationReportError);
  assert.throws(() => renderCondensationReport({ ...receipt, rawOutput: "{}" }), CondensationReportError);
});

const websiteTarget = "https://example.com/";
const websiteHtml = '<html><head><title>Fixture site</title></head><body><h1>Fixture site</h1><p>Frozen fixture description.</p></body></html>';
const websiteText = 'Frozen fixture description. <script>alert("fixture")</script> [hostile](javascript:alert(1)) **bold**';
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const website: WebsiteEvidence = {
  provider: "folio-public-html-v1", targetUrl: websiteTarget, maxPages: 6,
  pages: [{
    id: "page-1", url: websiteTarget, title: "Fixture site", text: websiteText,
    sha256: hash(websiteText), htmlSha256: hash(websiteHtml), capturedAt: "2026-09-30T00:00:00.000Z", truncated: true, bytes: Buffer.byteLength(websiteHtml),
    checks: evaluateHtml(websiteHtml, websiteTarget, new Headers()).checks.map(check => ({
      id: check.id, label: check.label, status: check.status, detail: check.detail,
      ...(check.evidence === undefined ? {} : { evidence: check.evidence }),
    })),
  }],
  attempts: [{ url: websiteTarget, status: "captured", pageId: "page-1" }, { url: "https://example.com/pricing", status: "unavailable", pageId: null }],
};
const websiteAnswer: WebsiteAnswer = {
  summary: "Fixture model summary, not verified.",
  findings: [{ priority: "high", observation: "Fixture model observation.", recommendation: "Fixture model advice.", evidence: [
    { pageId: "page-1", quote: websiteText }, { pageId: "page-1", checkId: website.pages[0].checks[0].id },
  ] }],
  limitations: ["Fixture model limitation."],
};
const websiteReceipt = {
  ...receipt, provider: "codegraff-gateway-fleet", mode: "host-website-frozen-evidence", search: null, parsedAnswer: null,
  website, websiteAnswer, rawOutput: JSON.stringify(websiteAnswer), guestModelAttached: true,
  credentials: "never-export-credentials", error: "never-export-error", recovery: { detail: "never-export-recovery" },
};

test("completed website export separates HTML checks, unverified advice and frozen provenance", () => {
  const report = renderCondensationReport(websiteReceipt);
  assert.equal(report.completed, true);
  for (const expected of [
    "Private Codegraff fleet website report", "Observed deterministic HTML checks", "Model summary (unverified)",
    "Prioritized recommendations (unverified)", "Fixture model advice", "high priority", "page\\-1", "https://example\\.com/",
    "Captured at: 2026\\-09\\-30", hash(websiteText), hash(websiteHtml), "Truncated: Yes", "unavailable",
    "unrendered, read-only HTML", "host chose page traversal", "Snippet absence does not prove sitewide absence",
    "not semantic support or factual truth", "not an overall quality score", "traffic or AI visibility", "certification",
    "app/owner history or published", "Total cost (USD):** Unknown", "Fixture model limitation",
  ]) assert.ok(report.markdown.includes(expected), expected);
  assert.doesNotMatch(report.markdown, /never-export|\/tmp\/private|box-1|12345678-1234/);
});

test("failed and uncertain website exports suppress all model output and advice", () => {
  for (const status of ["failed", "uncertain"]) {
    const report = renderCondensationReport({ ...websiteReceipt, status, execution: "reserved", exitCode: null,
      outputComplete: false, guestModelAttached: false, rawOutput: "UNVALIDATED OUTPUT", websiteAnswer });
    assert.equal(report.completed, false);
    assert.match(report.markdown, /source packet only; no confirmed model answer/);
    assert.match(report.markdown, /Model output and advice are suppressed/);
    assert.match(report.markdown, /Frozen fixture description/);
    assert.doesNotMatch(report.markdown, /UNVALIDATED OUTPUT|Fixture model|Prioritized recommendations|Model summary/);
  }
});

test("website exports refuse invalid lifecycle, provider, capture and attachment", () => {
  const patches = [
    { cleanup: "unknown" }, { cleanup: undefined }, { provider: "condensation-own-fleet" }, { mode: "other" },
    { status: "running" }, { exitCode: 1 }, { execution: "reserved" }, { outputComplete: false },
    { guestModelAttached: false }, { guestModelAttached: undefined }, { search: receipt.search }, { parsedAnswer: answer },
    { website: undefined }, { website: { ...website, provider: "other" } },
    { website: { ...website, pages: [] } },
    { website: { ...website, pages: [{ ...website.pages[0], text: "Tampered capture" }] } },
    { website: { ...website, pages: [{ ...website.pages[0], capturedAt: undefined }] } },
    { website: { ...website, pages: [{ ...website.pages[0], htmlSha256: undefined }] } },
    { website: { ...website, pages: [{ ...website.pages[0], checks: [] }] } },
    { website: { ...website, attempts: [] } },
    { rawOutput: "{}" }, { rawOutput: undefined }, { rawOutput: "not JSON" }, { websiteAnswer: null },
    { websiteAnswer: { ...websiteAnswer, summary: "Tampered summary" } },
  ];
  for (const patch of patches) assert.throws(() => renderCondensationReport({ ...websiteReceipt, ...patch }), CondensationReportError);
  assert.throws(() => renderCondensationReport({ ...websiteReceipt, status: "failed", cleanup: "unknown" }), CondensationReportError);
});

test("website exports reject missing or invented quoted and check evidence even when raw and parsed answers agree", () => {
  for (const references of [
    [{ pageId: "page-1", quote: "Invented quote" }], [{ pageId: "page-2", quote: websiteText }],
    [{ pageId: "page-1", checkId: "invented-check" }], [{ pageId: "page-2", checkId: website.pages[0].checks[0].id }],
    [{ pageId: "page-1" }], [],
  ]) {
    const tampered = { ...websiteAnswer, findings: [{ ...websiteAnswer.findings[0], evidence: references }] };
    assert.throws(() => renderCondensationReport({ ...websiteReceipt, websiteAnswer: tampered, rawOutput: JSON.stringify(tampered) }), CondensationReportError);
  }
});

test("website export escapes hostile prose, exact quotes and check text without activating Markdown or HTML", () => {
  const hostile = '<img src=x onerror=alert(1)> [click](javascript:alert(1)) **bold**';
  const hostileEvidence = structuredClone(website);
  hostileEvidence.pages[0].title = hostile;
  hostileEvidence.pages[0].checks[0].label = hostile;
  hostileEvidence.pages[0].checks[0].detail = hostile;
  hostileEvidence.pages[0].checks[0].evidence = hostile;
  const hostileAnswer = { ...websiteAnswer, summary: hostile, limitations: [hostile], findings: [
    { ...websiteAnswer.findings[0], observation: hostile, recommendation: hostile },
  ] };
  const report = renderCondensationReport({ ...websiteReceipt, query: hostile, model: "<script>fixture</script>",
    website: hostileEvidence, websiteAnswer: hostileAnswer, rawOutput: JSON.stringify(hostileAnswer) });
  assert.match(report.markdown, /&lt;img/);
  assert.match(report.markdown, /&lt;script&gt;/);
  assert.ok(report.markdown.includes("\\[click\\]\\(javascript:alert\\(1\\)\\) \\*\\*bold\\*\\*"));
  assert.ok(report.markdown.includes('> Frozen fixture description\\. &lt;script&gt;alert\\("fixture"\\)&lt;/script&gt;'));
  assert.doesNotMatch(report.markdown, /<img|<script>|\[click\]\(javascript:|\*\*bold\*\*/);
});
