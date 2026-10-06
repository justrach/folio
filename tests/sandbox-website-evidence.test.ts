import assert from "node:assert/strict";
import { test } from "node:test";
import { captureSandboxWebsite, validateWebsiteEvidence, validateWebsiteAnswer } from "../src/lib/sandbox-website-evidence";

const target = "https://example.com/";
const html = (links = "", text = "A developer product for teams with public pricing.") => `<html><head><title>A developer product</title></head><body><h1>Product for teams</h1><p>${text}</p>${links}</body></html>`;
const response = (body: string) => new Response(body, { headers: { "Content-Type": "text/html" } });
const capture = async () => captureSandboxWebsite(target, { fetcher: async () => response(html()), save: async () => {} });

test("capture follows only discovered same-origin public HTML links, at most six attempts", async () => {
  const calls: string[] = [];
  const links = Array.from({ length: 12 }, (_, i) => `<a href="/product-${i}">Product ${i}</a>`).join("") +
    '<a href="https://outside.example/">Outside</a><a href="http://example.com/">HTTP</a><a href="https://127.0.0.1/">Private</a><a href="/login">Login</a><a href="/logout">Logout</a><a href="/download.zip">Download</a><a href="/api/bill">API</a><a href="/pricing?token=secret">Query</a>';
  const evidence = await captureSandboxWebsite(target, { fetcher: async (url, init) => {
    const path = String(url); calls.push(path);
    assert.equal(new Headers(init?.headers).has("Authorization"), false);
    assert.equal(new Headers(init?.headers).has("Cookie"), false);
    return response(html(path === target ? links : ""));
  }, save: async () => {} });
  assert.equal(calls.length, 6); assert.equal(evidence.pages.length, 6); assert.equal(evidence.attempts.length, 6);
  assert.ok(calls.every(url => url === target || /^https:\/\/example.com\/product-\d+$/.test(url)));
  assert.ok(evidence.pages.every(page => page.checks.length === 10 && !Object.hasOwn(page, "score")));
  assert.deepEqual(validateWebsiteEvidence(evidence), evidence);
});

test("failed pages consume attempts and cross-origin redirects are not fetched", async () => {
  const calls: string[] = [];
  const evidence = await captureSandboxWebsite(target, { fetcher: async url => {
    const path = String(url); calls.push(path);
    if (path === target) return response(html('<a href="/pricing">Pricing</a><a href="/product">Product</a>'));
    if (path.endsWith("/pricing")) return new Response(null, { status: 302, headers: { Location: "https://outside.example/" } });
    return new Response("Unavailable", { status: 500 });
  }, save: async () => {} });
  assert.equal(evidence.pages.length, 1); assert.equal(evidence.attempts.length, 3);
  assert.deepEqual(evidence.attempts.slice(1).map(attempt => attempt.status), ["unavailable", "unavailable"]);
  assert.equal(calls.some(url => url.includes("outside.example")), false);
});

test("capture bounds text and removes script/template content while preserving hashes", async () => {
  const evidence = await captureSandboxWebsite(target, { fetcher: async () => response(html("", "Words ".repeat(2000)) + '<script>UNTRUSTED_SCRIPT</script><template>HIDDEN_TEMPLATE</template>'), save: async () => {} });
  const page = evidence.pages[0];
  assert.equal(page.text.length, 6000); assert.equal(page.truncated, true);
  assert.doesNotMatch(page.text, /UNTRUSTED_SCRIPT|HIDDEN_TEMPLATE/);
  assert.match(page.sha256, /^[a-f0-9]{64}$/); assert.match(page.htmlSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => validateWebsiteEvidence({ ...evidence, pages: [{ ...page, text: "Tampered" }] }));
});

test("an access challenge is not treated as a captured website", async () => {
  let saved = false;
  await assert.rejects(captureSandboxWebsite(target, { fetcher: async () => response('<title>Just a moment...</title><body>Challenge</body>'), save: async evidence => { saved = evidence.attempts[0].status === "unavailable"; } }), /starting page could not be captured/);
  assert.equal(saved, true);
});

test("persistence failure aborts capture rather than continuing with unfrozen input", async () => {
  let calls = 0;
  await assert.rejects(captureSandboxWebsite(target, { fetcher: async () => { calls++; return response(html('<a href="/pricing">Pricing</a>')); }, save: async () => { throw new Error("disk failure"); } }), /disk failure/);
  assert.equal(calls, 1);
});

test("website validation checks saved quote/check membership and refuses invented URLs or scores", async () => {
  const evidence = await capture();
  const answer = { summary: "A product for teams.", findings: [{ priority: "medium", observation: "A developer product is described.", recommendation: "Explain the intended team roles.", evidence: [{ pageId: "page-1", quote: "A developer product for teams" }, { pageId: "page-1", checkId: "description" }] }], limitations: ["One unrendered page."] };
  assert.deepEqual(validateWebsiteAnswer(JSON.stringify(answer), evidence), answer);
  for (const invalid of [
    { ...answer, score: 99 },
    { ...answer, summary: "Source: https://invented.example/" },
    { ...answer, findings: [{ ...answer.findings[0], evidence: [{ pageId: "page-1", quote: "Never captured" }] }] },
    { ...answer, findings: [{ ...answer.findings[0], evidence: [{ pageId: "page-1", checkId: "security" }] }] },
    { ...answer, findings: [{ ...answer.findings[0], evidence: [{ pageId: "page-9", checkId: "description" }] }] },
  ]) assert.throws(() => validateWebsiteAnswer(JSON.stringify(invalid), evidence));
});

test("query-bearing, credentialed, private and non-HTTPS targets fail before any fetch", async () => {
  for (const url of ["https://example.com/?secret=value", "https://user:password@example.com/", "https://127.0.0.1/", "http://example.com/", "https://example.com:1234/"]) {
    let calls = 0;
    await assert.rejects(captureSandboxWebsite(url, { fetcher: async () => { calls++; return response(html()); }, save: async () => {} }));
    assert.equal(calls, 0);
  }
});
