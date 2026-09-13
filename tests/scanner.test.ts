import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHtml, evaluationMethodology } from "../src/lib/evaluation";
import {
  assertAllowedUrl,
  boundedFetch,
  configuredScanHosts,
  normalizeScanUrl,
  ScanError,
  scanWebsite,
} from "../src/lib/scanner";
import { readJsonBody } from "../src/lib/api-request";

const hosts = configuredScanHosts();
const completeHtml = `<!doctype html><html><head>
  <title>Useful website documentation</title>
  <meta name="description" content="Learn how to use our documentation and find complete product guides, integration references, and practical examples." />
  <link rel="canonical" href="https://example.com/" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example"}</script>
  </head><body><h1>Documentation</h1><p>${"useful information ".repeat(110)}</p><a href="/guides">Guides</a><img src="hero.png" alt="Documentation overview" /></body></html>`;

test("the published rubric totals 100 and a complete page earns all points", () => {
  assert.equal(
    evaluationMethodology.weights.reduce((sum, check) => sum + check.weight, 0),
    100,
  );
  const result = evaluateHtml(completeHtml, "https://example.com/");
  assert.equal(result.seoScore, 100);
  assert.equal(result.checks.length, 10);
  assert.ok(
    result.checks.every(
      (check) =>
        check.sourceUrl === "https://example.com/" && check.status === "pass",
    ),
  );
});

test("hidden markup cannot create visible content or primary headings", () => {
  const result = evaluateHtml(
    `<html><head><script>const text = '<h1>Fake</h1>${"word ".repeat(250)}';</script></head><body><!--<h1>Also fake</h1>--><p>Short page</p></body></html>`,
    "https://example.com/",
  );
  assert.equal(result.wordCount, 2);
  assert.equal(
    result.checks.find((check) => check.id === "headings")?.status,
    "fail",
  );
  assert.equal(
    result.checks.find((check) => check.id === "readable-content")?.points,
    0,
  );
});

test("header noindex lowers score and optional files never earn or lose points", async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input) !== "https://example.com/")
      return new Response("Missing", { status: 404 });
    return new Response(completeHtml, {
      headers: {
        "Content-Type": "text/html",
        "X-Robots-Tag": "googlebot: noindex, nofollow",
      },
    });
  };
  const result = await scanWebsite("example.com", { fetcher });
  assert.equal(result.seoScore, 90);
  assert.equal(
    result.checks.filter((check) => check.status === "optional").length,
    4,
  );
  assert.equal(result.contentHash.length, 64);
  assert.equal(result.source, "live");
});

test("discovery scan inspects four bounded documents without following listed URLs or changing the HTML score", async () => {
  const requests: string[] = [];
  const documents: Record<string, [string, string]> = {
    "/robots.txt": ["User-agent: *\nDisallow: /account\nSitemap: https://example.com/elsewhere.xml", "text/plain"],
    "/llms.txt": ["# Example\n\n> Product documentation.\n\n## Guides\n- [Start](/docs/start.md)", "text/markdown"],
    "/llms-full.txt": ["<!doctype html><html><title>Not found</title></html>", "text/html"],
    "/sitemap.xml": ['<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/docs</loc></url></urlset>', "application/xml"],
  };
  const result = await scanWebsite("example.com", { fetcher: async input => {
    const url = new URL(String(input)); requests.push(url.href);
    const [body, type] = url.pathname === "/" ? [completeHtml, "text/html"] : documents[url.pathname];
    return new Response(body, { headers: { "content-type": type } });
  } });
  assert.equal(result.seoScore, evaluateHtml(completeHtml, "https://example.com/").seoScore);
  assert.equal(requests.length, 5);
  const get = (id: string) => JSON.parse(result.checks.find(check => check.id === id)!.evidence!);
  assert.equal(get("llms-file").details.linkCount, 1);
  assert.equal(get("robots-file").details.policyEvaluated, false);
  assert.equal(get("sitemap-file").details.entryCount, 1);
  assert.equal(get("llms-full-file").status, "malformed");
  assert.ok(result.checks.filter(check => check.status === "optional").every(check => check.points === 0 && check.maxPoints === 0));
  assert.ok(!requests.some(url => url.includes("elsewhere") || url.includes("/docs")));
});

test("discovery failures retain upstream missing, blocked and size-limited outcomes", async () => {
  const result = await scanWebsite("example.com", { fetcher: async input => {
    const path = new URL(String(input)).pathname;
    if (path === "/") return new Response(completeHtml, { headers: { "content-type": "text/html" } });
    if (path === "/robots.txt") return new Response("Missing", { status: 404 });
    if (path === "/llms.txt") return new Response("Forbidden", { status: 403 });
    return new Response("large", { headers: { "content-type": "text/plain", "content-length": "2000001" } });
  } });
  const get = (id: string) => JSON.parse(result.checks.find(check => check.id === id)!.evidence!);
  assert.equal(get("robots-file").status, "missing"); assert.equal(get("robots-file").httpStatus, 404);
  assert.equal(get("llms-file").status, "blocked"); assert.equal(get("llms-file").httpStatus, 403);
  assert.equal(get("llms-full-file").status, "limited");
  assert.equal(get("sitemap-file").status, "limited");
  assert.equal(result.seoScore, 100);
});

test("malformed JSON-LD fails and unrelated JSON does not earn full structured-data credit", () => {
  const broken = evaluateHtml(
    completeHtml.replace('"@type":"WebSite"', '"@type":WebSite'),
    "https://example.com/",
  );
  assert.equal(
    broken.checks.find((check) => check.id === "structured-data")?.points,
    0,
  );
  const unrelated = evaluateHtml(
    completeHtml.replace(
      "https://schema.org",
      "https://schema.org.evil.example",
    ),
    "https://example.com/",
  );
  assert.equal(
    unrelated.checks.find((check) => check.id === "structured-data")?.points,
    5,
  );
});

test("untrusted source content remains escaped in draft HTML repair artifacts", () => {
  const result = evaluateHtml(
    '<body><h1>&lt;img src=x onerror=alert(1)&gt;</h1><p>"&lt;script&gt;alert(1)&lt;/script&gt;</p></body>',
    "https://example.com/",
  );
  const titlePatch = result.patches.find((patch) => patch.id === "add-title");
  assert.ok(titlePatch?.after.includes("&lt;img"));
  assert.ok(!titlePatch?.after.includes("<img"));
});

test("URL normalization rejects private, credentialed and alternate-protocol destinations", () => {
  for (const url of [
    "http://example.com",
    "file:///etc/passwd",
    "https://localhost",
    "https://localhost.local",
    "https://127.0.0.1",
    "https://2130706433",
    "https://[::1]",
    "https://user:pass@example.com",
    "https://example.com:8443",
    "https://metadata.google.internal",
  ]) {
    assert.throws(() => normalizeScanUrl(url), ScanError, url);
  }
  assert.equal(
    normalizeScanUrl("example.com/path#section").href,
    "https://example.com/path",
  );
  assert.throws(
    () =>
      assertAllowedUrl(normalizeScanUrl("https://example.com.evil.org"), hosts),
    /not enabled/,
  );
  assert.throws(
    () => assertAllowedUrl(normalizeScanUrl("https://unapproved.org"), hosts),
    /not enabled/,
  );
});

test("redirect destinations are checked before the redirected request is issued", async () => {
  for (const location of [
    "https://127.0.0.1/admin",
    "https://unapproved.org",
    "http://example.com/",
  ]) {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location } });
    };
    await assert.rejects(
      boundedFetch(new URL("https://example.com/"), {
        allowedHosts: hosts,
        fetcher,
      }),
      ScanError,
    );
    assert.equal(calls, 1);
  }
});

test("redirect chains are bounded and a safe relative redirect is accepted", async () => {
  let calls = 0;
  await assert.rejects(
    boundedFetch(new URL("https://example.com/"), {
      allowedHosts: hosts,
      fetcher: async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "/again" },
        });
      },
    }),
    /three redirects/,
  );
  assert.equal(calls, 4);
  const safe = await boundedFetch(new URL("https://example.com/"), {
    allowedHosts: hosts,
    fetcher: async (url) =>
      String(url).endsWith("/guides")
        ? new Response("<p>Guides</p>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
        : new Response(null, { status: 302, headers: { location: "/guides" } }),
  });
  assert.equal(safe.url, "https://example.com/guides");
});

test("streamed responses cannot evade the byte cap by omitting content-length", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("a".repeat(21)));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/html" } },
    );
  await assert.rejects(
    boundedFetch(new URL("https://example.com/"), {
      allowedHosts: hosts,
      fetcher,
      maxBytes: 20,
    }),
    /size limit/,
  );
});

test("non-HTML responses are rejected and an aborted fetch is reported as timeout", async () => {
  await assert.rejects(
    boundedFetch(new URL("https://example.com/"), {
      allowedHosts: hosts,
      fetcher: async () =>
        new Response("binary", {
          headers: { "Content-Type": "application/pdf" },
        }),
    }),
    /unsupported content type/,
  );
  const fetcher: typeof fetch = async (_input, init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      ),
    );
  await assert.rejects(
    boundedFetch(new URL("https://example.com/"), {
      allowedHosts: hosts,
      fetcher,
      timeoutMs: 5,
    }),
    /too long/,
  );
});

test("write requests reject foreign origins and oversized JSON without a declared length", async () => {
  await assert.rejects(
    readJsonBody(
      new Request("https://folio.example/api/scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.example",
        },
        body: "{}",
      }),
    ),
    /Cross-origin/,
  );
  await assert.rejects(
    readJsonBody(
      new Request("https://folio.example/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "a".repeat(4200) }),
      }),
    ),
    /too large/,
  );
  const body = await readJsonBody(
    new Request("http://0.0.0.0:3001/api/scans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3001",
        Host: "localhost:3001",
      },
      body: '{"url":"https://example.com"}',
    }),
  );
  assert.equal(body.url, "https://example.com");
});
