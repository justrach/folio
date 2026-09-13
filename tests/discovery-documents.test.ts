import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDiscoveryDocument, DISCOVERY_DOCUMENT_LIMITS, DISCOVERY_LINK_LIMIT,
  type DiscoveryDocumentKind, type DiscoveryDocumentInput } from "../src/lib/discovery-documents";

const namespace = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
const analyze = (kind: DiscoveryDocumentKind, body: string, extra: Partial<DiscoveryDocumentInput> = {}) => analyzeDiscoveryDocument({
  kind, url: `https://example.com/${kind}`, httpStatus: 200,
  contentType: kind === "sitemap.xml" ? "application/xml" : "text/plain; charset=utf-8", body, ...extra,
});

test("missing, blocked, unavailable and incomplete captures stay distinct and unscored", () => {
  const outcomes = [
    [404, undefined, "missing"], [410, undefined, "missing"], [403, undefined, "blocked"], [429, undefined, "blocked"],
    [500, undefined, "unavailable"], [302, undefined, "unavailable"], [undefined, "timeout", "unavailable"],
    [undefined, "network", "unavailable"], [undefined, "blocked", "blocked"], [undefined, "too-large", "limited"],
  ] as const;
  for (const [httpStatus, failure, expected] of outcomes) {
    const result = analyzeDiscoveryDocument({ kind: "llms.txt", url: "https://example.com/llms.txt", httpStatus, failure });
    assert.equal(result.status, expected); assert.equal(result.details, null); assert.equal(result.scored, false);
  }
  assert.equal(analyze("llms.txt", "# A complete-looking prefix", { truncated: true }).status, "limited");
});

test("llms.txt observes title, optional summary, sections and document links without reading code examples as links", () => {
  const result = analyze("llms.txt", '\uFEFF# Example docs\n\n> A short guide to the site.\n> Relevant context.\n\n## Guides\n- [Start](/docs/start.md)\n- [External](https://docs.example.org/guide.md)\n- [Unsafe](javascript:alert)\n\n```md\n# Fake title\n- [Fake](https://example.com/not-a-real-link)\n```\n`[Inline fake](https://example.com/also-fake)`');
  assert.equal(result.status, "usable"); assert.equal(result.experimental, true); assert.equal(result.scored, false);
  assert.equal(result.details?.format, "markdown");
  if (result.details?.format !== "markdown") throw new Error("Expected Markdown observations");
  assert.equal(result.details.title, "Example docs");
  assert.equal(result.details.summary, "A short guide to the site. Relevant context.");
  assert.deepEqual(result.details.sectionTitles, ["Guides"]);
  assert.deepEqual(result.details.links, [
    { label: "Start", url: "https://example.com/docs/start.md", external: false },
    { label: "External", url: "https://docs.example.org/guide.md", external: true },
  ]);
  assert.match(result.warnings.join(" "), /not retained/);
});

test("only llms.txt's H1 is required; missing optional sections never create a numeric score", () => {
  const titleOnly = analyze("llms.txt", "# Site\n");
  assert.equal(titleOnly.status, "usable"); assert.match(titleOnly.warnings.join(" "), /optional/);
  assert.equal(analyze("llms.txt", "Useful prose without an H1.").status, "malformed");
  const full = analyze("llms-full.txt", "A full document with useful prose and no required index structure.");
  assert.equal(full.status, "usable"); assert.equal(full.experimental, true);
  assert.match(full.limitations.join(" "), /convention/);
  assert.equal(Object.hasOwn(full, "score"), false);
  assert.equal(analyze("llms.txt", "# Nested docs", { url: "https://example.com/docs/llms.txt" }).status, "usable", "The current proposal permits subpath files.");
});

test("Markdown code delimiters and unsupported escaped destinations do not invent document URLs", () => {
  const result = analyze("llms.txt", '# Site\n``some ` [Inline fake](https://example.com/fake)``\n```md\n```still-code\n[Fenced fake](https://example.com/fake)\n```\n[Escaped](/docs\\_foo)\n[Entity](/docs?a=1&amp;b=2)\n[Real](/docs?a=1&b=2)');
  if (result.details?.format !== "markdown") throw new Error("Expected Markdown observations");
  assert.deepEqual(result.details.links.map(link => link.url), ["https://example.com/docs?a=1&b=2"]);
  assert.match(result.warnings.join(" "), /unsupported Markdown escapes or entities/);
});

test("HTML errors and access challenges masquerading as discovery documents are not usable files", () => {
  for (const kind of ["llms.txt", "llms-full.txt", "robots.txt", "sitemap.xml"] as const) {
    assert.equal(analyze(kind, '<!doctype html><html><head><title>Not found</title></head><body>Missing</body></html>').status, "malformed");
    assert.equal(analyze(kind, '<!-- edge error --><html><body>Missing</body></html>').status, "malformed");
    assert.equal(analyze(kind, '<html><head><title>Client Challenge</title></head></html>').status, "blocked");
  }
  assert.equal(analyze("llms-full.txt", "<div>Server error</div>", { contentType: "text/html" }).status, "malformed");
  assert.equal(analyze("llms-full.txt", "404 Not Found").status, "malformed");
  assert.equal(analyze("llms-full.txt", '{"error":"Not Found"}').status, "malformed");
  assert.equal(analyze("robots.txt", "Error: Not Found").status, "malformed");
  assert.equal(analyze("llms.txt", "# Documentation", { contentType: "application/octet-stream" }).status, "usable");
});

test("robots observations retain parseable groups and sitemap references without deciding crawler access", () => {
  const result = analyze("robots.txt", '# Public instructions\nUser-agent: ExampleBot\nUser-agent: OtherBot\nDisallow: /private\nSitemap: https://example.com/sitemap.xml\nAllow: /public\nUser-agent: *\nDisallow:\nCrawl-delay: 10\nMalformed line\n');
  assert.equal(result.status, "usable");
  if (result.details?.format !== "robots") throw new Error("Expected robots observations");
  assert.equal(result.details.atOriginRoot, true);
  assert.equal(result.details.groupCount, 2, "A Sitemap record must not terminate a user-agent group.");
  assert.deepEqual(result.details.userAgents, ["ExampleBot", "OtherBot", "*"]);
  assert.equal(result.details.allowCount, 1); assert.equal(result.details.disallowCount, 2); assert.equal(result.details.emptyRuleCount, 1);
  assert.equal(result.details.policyEvaluated, false); assert.equal(result.details.unknownDirectiveCount, 1); assert.equal(result.details.malformedLineCount, 1);
  assert.deepEqual(result.details.sitemapUrls, ["https://example.com/sitemap.xml"]);
  assert.match(result.limitations.join(" "), /not a complete RFC 9309/);
});

test("empty robots files are usable syntax, while orphan rules and non-root files retain their limitations", () => {
  assert.equal(analyze("robots.txt", "# Comments only\n").status, "usable");
  assert.equal(analyze("robots.txt", "Disallow: /private").status, "malformed");
  assert.equal(analyze("robots.txt", "Sitemap: /relative.xml").status, "malformed");
  const nested = analyze("robots.txt", "User-agent: *\nDisallow: /", { url: "https://example.com/docs/robots.txt" });
  assert.match(nested.warnings.join(" "), /not at \/robots.txt/);
  assert.equal(nested.details?.format === "robots" && nested.details.policyEvaluated, false);
});

test("sitemaps count page loc entries, decode XML entities, and ignore extension URLs", () => {
  const result = analyze("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset ${namespace} xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
    <url><loc>https://example.com/page?a=1&amp;b=2</loc><image:image><image:loc>https://example.com/image.png</image:loc></image:image></url>
    <url><loc><![CDATA[https://example.com/another]]></loc><lastmod>2026-09-13</lastmod></url></urlset>`);
  assert.equal(result.status, "usable");
  if (result.details?.format !== "urlset") throw new Error("Expected urlset observations");
  assert.equal(result.details.entryCount, 2); assert.equal(result.details.validUrlCount, 2);
  assert.deepEqual(result.details.urls, ["https://example.com/page?a=1&b=2", "https://example.com/another"]);
  assert.equal(result.details.schemaValidated, false);
});

test("sitemap indexes expose child sitemap URLs without following them or treating them as page URLs", () => {
  const result = analyze("sitemap.xml", '<sm:sitemapindex xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:sitemap><sm:loc>https://example.com/one.xml.gz</sm:loc></sm:sitemap><sm:sitemap><sm:loc>https://cdn.example.org/two.xml</sm:loc></sm:sitemap></sm:sitemapindex>');
  assert.equal(result.status, "usable");
  if (result.details?.format !== "sitemapindex") throw new Error("Expected sitemap index observations");
  assert.equal(result.details.entryCount, 2); assert.equal(result.details.externalUrlCount, 1);
  assert.match(result.warnings.join(" "), /authority was not checked/);
  assert.match(result.summary, /no listed URLs were fetched/);
});

test("XML quoted greater-than signs remain valid while literal controls and undeclared prefixes do not", () => {
  const entry = '<url><loc>https://example.com/</loc></url>';
  assert.equal(analyze("sitemap.xml", `<urlset ${namespace} note="a > b">${entry}</urlset>`).status, "usable");
  assert.equal(analyze("sitemap.xml", `<urlset ${namespace}><url>\u0001<loc>https://example.com/</loc></url></urlset>`).status, "malformed");
  assert.equal(analyze("sitemap.xml", `<urlset ${namespace} bad:attr="x">${entry}</urlset>`).status, "malformed");
  assert.equal(analyze("sitemap.xml", `<urlset ${namespace} toString:attr="x">${entry}</urlset>`).status, "malformed");
});

test("malformed sitemap XML, unsafe loc values and entity declarations do not become valid coverage", () => {
  const invalid = [
    `<urlset ${namespace}><url><loc>https://example.com/</url></loc></urlset>`,
    '<urlset><url><loc>https://example.com/</loc></url></urlset>',
    `<urlset ${namespace}><url/></urlset>`,
    `<urlset ${namespace}><url><loc>/relative</loc></url></urlset>`,
    `<urlset ${namespace}><url><loc>javascript:alert</loc></url></urlset>`,
    `<urlset ${namespace}><url><loc>https://user:secret@example.com/</loc></url></urlset>`,
    `<urlset ${namespace}><url><loc>https://example.com/?a=1&b=2</loc></url></urlset>`,
    `<urlset ${namespace}><url><loc>https://example.com/a</loc><loc>https://example.com/b</loc></url></urlset>`,
    `<!DOCTYPE urlset [<!ENTITY x SYSTEM "https://must-not-fetch.invalid/">]><urlset ${namespace}><url><loc>&x;</loc></url></urlset>`,
  ];
  for (const body of invalid) assert.equal(analyze("sitemap.xml", body).status, "malformed", body);
});

test("URL output is capped without inventing complete lists or fetching additional documents", () => {
  const count = DISCOVERY_LINK_LIMIT + 3;
  const xml = `<urlset ${namespace}>${Array.from({ length: count }, (_, index) => `<url><loc>https://example.com/${index}</loc></url>`).join("")}</urlset>`;
  const result = analyze("sitemap.xml", xml);
  if (result.details?.format !== "urlset") throw new Error("Expected Sitemap observations");
  assert.equal(result.status, "usable"); assert.equal(result.details.entryCount, count);
  assert.equal(result.details.urls.length, DISCOVERY_LINK_LIMIT); assert.equal(result.details.urlsTruncated, true);
  const md = analyze("llms.txt", '# Site\n' + Array.from({ length: count }, (_, index) => `- [Doc ${index}](/${index}.md)`).join("\n"));
  if (md.details?.format !== "markdown") throw new Error("Expected Markdown observations");
  assert.equal(md.details.linkCount, count); assert.equal(md.details.links.length, DISCOVERY_LINK_LIMIT); assert.equal(md.details.linksTruncated, true);
});

test("UTF-8 byte, incomplete capture and XML nesting bounds preserve an unmeasured limited outcome", () => {
  assert.equal(DISCOVERY_DOCUMENT_LIMITS["robots.txt"], 500 * 1024);
  const unicode = '# Site\n' + '界'.repeat(Math.floor(DISCOVERY_DOCUMENT_LIMITS["llms.txt"] / 2));
  assert.equal(analyze("llms.txt", unicode).status, "limited", "Bound bytes rather than JavaScript string length.");
  assert.equal(analyze("sitemap.xml", `<urlset ${namespace}>` + '<url>'.repeat(34)).status, "limited");
  const result = analyze("llms-full.txt", 'x'.repeat(DISCOVERY_DOCUMENT_LIMITS["llms-full.txt"] + 1));
  assert.equal(result.status, "limited"); assert.equal(result.details, null);
});
