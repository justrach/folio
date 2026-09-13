import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { evaluateHtml } from "../src/lib/evaluation";
import { captureDeveloperHomepage, captureLocalFolio, mapDeveloperTools, reviewedHomepageHosts, validateDeveloperTools,
  DEVELOPER_TOOL_CAPTURE_LIMIT, LOCAL_FOLIO_URL, type CapturedDeveloperPage, type DeveloperToolReadinessSummary } from "../src/lib/developer-tools-evaluation";
import { createReadinessSandbox, evaluateDeveloperTool, publicHomepageSummary, verifyFrozenCapture } from "../scripts/evaluate-developer-tools";

const tool = { id: "fixture-tool", name: "Fixture tool", category: "Testing", websiteUrl: "https://example.com/" };
const html = '<!doctype html><html><head><title>A developer tool fixture</title><meta name="description" content="A synthetic developer-tool page used only to verify our bounded local test harness."><link rel="canonical" href="https://example.com/"></head><body><h1>Fixture</h1><a href="/docs">Docs</a><script>fetch("https://must-not-execute.invalid");throw new Error("Page script ran");</script><p>' + 'Documented workflow '.repeat(120) + '</p></body></html>';
const htmlResponse = () => new Response(html, { headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex" } });

test("catalog homepage redirects permit only the reviewed host and www spelling", async () => {
  assert.deepEqual([...reviewedHomepageHosts("https://example.com/")], ["example.com", "www.example.com"]);
  assert.deepEqual([...reviewedHomepageHosts("https://www.example.com/")], ["www.example.com", "example.com"]);
  for (const websiteUrl of ["http://example.com", "https://localhost/", "https://127.0.0.1/", "https://a:b@example.com/", "https://example.com/?token=private", "https://example.com/#section"])
    assert.throws(() => reviewedHomepageHosts(websiteUrl));
  const calls: string[] = [];
  const allowed = await captureDeveloperHomepage(tool, async input => {
    calls.push(String(input));
    return calls.length === 1 ? new Response(null, { status: 301, headers: { Location: "https://www.example.com/" } }) : htmlResponse();
  });
  assert.equal(allowed.url, "https://www.example.com/"); assert.equal(calls.length, 2);
  let forbiddenCalls = 0;
  await assert.rejects(captureDeveloperHomepage(tool, async () => { forbiddenCalls++; return new Response(null, { status: 302, headers: { Location: "https://docs.example.com/" } }); }));
  assert.equal(forbiddenCalls, 1, "Redirect must be checked before contacting a new host.");
  let offHostCalls = 0;
  await assert.rejects(captureDeveloperHomepage(tool, async () => { offHostCalls++; return new Response(null, { status: 301, headers: { Location: "https://other-example.com/products/tool/" } }); }));
  assert.equal(offHostCalls, 1, "A larger capture limit must not permit an unreviewed canonical hostname.");
  assert.throws(() => validateDeveloperTools([tool, tool]));
  assert.throws(() => validateDeveloperTools([{ ...tool, id: undefined }]));
  assert.equal(validateDeveloperTools([{ ...tool, audience: "Learning" }])[0].audience, "Learning");
  assert.throws(() => validateDeveloperTools([{ ...tool, audience: "Unknown" }]));
});

test("complete large homepages are retained within the bound; oversized streams are canceled", async () => {
  const completeHtml = html.replace("<head>", "<head><!--" + "x".repeat(DEVELOPER_TOOL_CAPTURE_LIMIT - Buffer.byteLength(html) - 7) + "-->");
  assert.equal(Buffer.byteLength(completeHtml), DEVELOPER_TOOL_CAPTURE_LIMIT);
  const page = await captureDeveloperHomepage(tool, async () => new Response(completeHtml, { headers: { "Content-Type": "text/html" } }));
  assert.equal(page.bytes, DEVELOPER_TOOL_CAPTURE_LIMIT);
  assert.equal(page.body, completeHtml, "The tail of a modern homepage must reach the evaluator; never score a truncated prefix.");

  let canceled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(DEVELOPER_TOOL_CAPTURE_LIMIT)); controller.enqueue(new Uint8Array(1)); },
    cancel() { canceled = true; },
  });
  await assert.rejects(captureDeveloperHomepage(tool, async () => new Response(oversized, { headers: { "Content-Type": "text/html" } })), /size limit/);
  assert.equal(canceled, true);
  await assert.rejects(captureDeveloperHomepage(tool, async () => new Response(html, { headers: {
    "Content-Type": "text/html", "Content-Length": String(DEVELOPER_TOOL_CAPTURE_LIMIT + 1),
  } })), /size limit/);
});

test("local preview is fixed to localhost3001, sends no cookies and follows no redirects", async () => {
  const page = await captureLocalFolio(async (input, init) => {
    assert.equal(input, LOCAL_FOLIO_URL); assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).has("Cookie"), false); assert.equal(new Headers(init?.headers).has("Authorization"), false);
    return htmlResponse();
  });
  assert.equal(page.url, LOCAL_FOLIO_URL);
  await assert.rejects(captureLocalFolio(async () => new Response(null, { status: 302, headers: { Location: "http://localhost:9999/private" } })), /redirects are not followed/);
  await assert.rejects(captureLocalFolio(async () => new Response("x".repeat(DEVELOPER_TOOL_CAPTURE_LIMIT + 1), { headers: { "Content-Type": "text/html" } })), /size limit/);
});

test("batch concurrency is capped at three and preserves catalog ordering", async () => {
  let active = 0, maxActive = 0;
  const result = await mapDeveloperTools([0, 1, 2, 3, 4, 5, 6], async value => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--; return value * 2;
  });
  assert.equal(maxActive, 3); assert.deepEqual(result, [0, 2, 4, 6, 8, 10, 12]);
});

test("capture failures remain unavailable with no zero score or leaked diagnostics", async () => {
  let evaluations = 0;
  const capture = await evaluateDeveloperTool(tool, "public-homepage", async page => { evaluations++; return evaluateHtml(page.body, page.url); },
    async () => { throw new Error("secret connection details"); });
  assert.equal(capture.result.status, "unavailable"); assert.equal(capture.result.score, null);
  assert.deepEqual(capture.result.checks, []); assert.equal(evaluations, 0); assert.equal(capture.html, null);
  assert.ok(!JSON.stringify(capture.result).includes("secret"));
});

test("public exports retain homepage observations exactly and keep local-only batches private", async () => {
  const evaluate = async (page: CapturedDeveloperPage) => evaluateHtml(page.body, page.url);
  const homepage = await evaluateDeveloperTool(tool, "public-homepage", evaluate, async () => htmlResponse());
  const local = await evaluateDeveloperTool({ ...tool, id: "folio-local", name: "Folio" }, "local-preview", evaluate, async () => htmlResponse());
  const summary: DeveloperToolReadinessSummary = {
    schemaVersion: "developer-tool-readiness-v1", suiteVersion: "readiness-v1", generatedAt: "2026-09-13T00:00:00.000Z",
    batchId: "fixture", scope: "Homepage HTML only; no JavaScript or API tasks", runtime: "workerd",
    evaluatorSourceHash: "fixture-evaluator", captureLimitBytes: DEVELOPER_TOOL_CAPTURE_LIMIT, timeoutMs: 8000,
    results: [homepage.result, local.result],
  };
  const original = JSON.stringify(summary);
  const published = publicHomepageSummary(summary);
  assert.ok(published);
  assert.equal(JSON.stringify(published.results), JSON.stringify([homepage.result]));
  assert.equal(published.batchId, summary.batchId);
  assert.equal(published.generatedAt, summary.generatedAt);
  assert.ok(!JSON.stringify(published).includes("folio-local"));
  assert.ok(!JSON.stringify(published).includes(LOCAL_FOLIO_URL));
  assert.equal(JSON.stringify(summary), original, "Private manifests keep every outcome for offline verification.");
  assert.equal(publicHomepageSummary({ ...summary, results: [local.result] }), null, "Local-only runs must leave the public baseline unchanged.");
});

test("HTTP 200 access challenges stay unmeasured while normal pages with captcha integrations remain eligible", async () => {
  let evaluations = 0;
  for (const title of ["Client Challenge", "Just a moment...", "Attention Required! | Cloudflare", "Access Denied"]) {
    const challenge = await evaluateDeveloperTool(tool, "public-homepage", async page => {
      evaluations++; return evaluateHtml(page.body, page.url);
    }, async () => new Response(`<html><head><title>${title}</title></head><body>Please enable JavaScript to proceed.</body></html>`, {
      headers: { "Content-Type": "text/html" },
    }));
    assert.equal(challenge.result.status, "unavailable");
    assert.equal(challenge.result.score, null);
    assert.match(challenge.result.error ?? "", /access challenge/);
    assert.deepEqual(challenge.result.checks, []);
    assert.ok(challenge.html && challenge.result.contentHash, "Keep the captured interstitial for diagnosis and hash verification.");
    await verifyFrozenCapture(challenge, async () => { throw new Error("An unavailable challenge must not be scored on replay."); });
  }
  assert.equal(evaluations, 0);
  const normal = await evaluateDeveloperTool(tool, "public-homepage", async page => { evaluations++; return evaluateHtml(page.body, page.url); },
    async () => new Response(html.replace("</body>", '<div class="g-recaptcha"></div></body>'), { headers: { "Content-Type": "text/html" } }));
  assert.equal(normal.result.status, "complete");
  assert.equal(evaluations, 1, "A normal homepage containing a captcha widget is not an access interstitial.");
});

test("real workerd reproduces readiness-v1 without running page scripts; hashes catch tampering", { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-developer-readiness-"));
  const sandbox = await createReadinessSandbox(directory);
  try {
    const capture = await evaluateDeveloperTool(tool, "public-homepage", sandbox.evaluate, async () => htmlResponse());
    assert.equal(capture.result.status, "complete");
    assert.deepEqual(capture.evaluation, evaluateHtml(html, tool.websiteUrl, new Headers({ "x-robots-tag": "noindex" })));
    assert.equal(capture.result.checks.find(check => check.id === "indexability")?.points, 0);
    assert.ok(capture.result.contentHash); assert.ok(!JSON.stringify(capture.result).includes("must-not-execute"));
    assert.ok(capture.result.checks.every(check => !Object.hasOwn(check, "evidence")));
    await verifyFrozenCapture(capture, sandbox.evaluate);
    await assert.rejects(verifyFrozenCapture({ ...capture, html: capture.html + "tampered" }, sandbox.evaluate), /hash/);
    await assert.rejects(verifyFrozenCapture({ ...capture, result: { ...capture.result, score: 100 } }, sandbox.evaluate), /reproduce/);
    const largeHtml = html.replace("<head>", "<head><!--" + "x".repeat(3_200_000) + "-->");
    const large = await evaluateDeveloperTool({ ...tool, audience: "Developer tools" }, "public-homepage", sandbox.evaluate,
      async () => new Response(largeHtml, { headers: { "Content-Type": "text/html" } }));
    assert.equal(large.result.status, "complete", "The sandbox accepts full captures above its former 3 MB ceiling.");
    assert.equal(large.result.audience, "Developer tools");
    assert.equal(large.html, largeHtml);
    assert.deepEqual(large.evaluation, evaluateHtml(html, tool.websiteUrl), "Metadata after 3 MB of embedded content still receives the unchanged rubric.");
    await verifyFrozenCapture(large, sandbox.evaluate);
    await assert.rejects(sandbox.evaluate({ body: "x".repeat(DEVELOPER_TOOL_CAPTURE_LIMIT + 1), url: tool.websiteUrl, headers: new Headers(), bytes: DEVELOPER_TOOL_CAPTURE_LIMIT + 1 }), /could not evaluate/);
    const local = await evaluateDeveloperTool({ ...tool, id: "folio-local", name: "Folio" }, "local-preview", sandbox.evaluate, async () => htmlResponse());
    assert.equal(local.result.captureKind, "local-preview"); assert.equal(local.result.finalUrl, LOCAL_FOLIO_URL);
    assert.equal(local.result.checks.find(check => check.id === "https")?.points, 0, "Local HTTP must not be scored as hosted HTTPS.");
  } finally { await sandbox.dispose(); await rm(directory, { recursive: true, force: true }); }
});
