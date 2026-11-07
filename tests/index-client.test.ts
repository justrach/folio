import assert from "node:assert/strict";
import test from "node:test";
import { IndexClientError, createIndexClient } from "../src/lib/index-client";

type Call = { url: string; init?: RequestInit };

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const entity = {
  id: "ent_manus.im", type: "entity", name: "Manus", domain: "manus.im", category: null, description: null,
  links: { home: "https://manus.im", docs: "https://manus.im/docs" },
  coverage: { inventory: true, rankings: true, content: false },
  counts: { inventoryPages: 3970, sections: 20, sampledPages: 0, rankedKeywords: 50, landingPages: 14 },
  freshness: null, ranking: { rows: 50, perThousandInventoryPages: 12.6, status: "success" },
};

test("entity is fetched by domain with the bearer key attached", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: entity }]);
  const client = createIndexClient({ baseUrl: "https://api.example.test/", apiKey: "k_test", fetchImpl });
  const record = await client.entity({ domain: "manus.im" });
  assert.equal(record.id, "ent_manus.im");
  assert.equal(calls[0].url, "https://api.example.test/api/index/v1/entity?domain=manus.im");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer k_test");
});

test("lists expose the cursor and keep the version", async () => {
  const { calls, fetchImpl } = fakeFetch([
    { body: { items: [{ id: "sec_1", type: "section", entity: "ent_manus.im", path: "/tools", pages: 113, share: 0.03 }], nextCursor: "sec_1", truncated: true, version: "index-v1" } },
  ]);
  const client = createIndexClient({ baseUrl: "https://api.example.test", fetchImpl });
  const page = await client.sections("ent_manus.im", { limit: 1 });
  assert.equal(page.nextCursor, "sec_1");
  assert.equal(page.version, "index-v1");
  assert.equal(calls[0].url, "https://api.example.test/api/index/v1/entities/ent_manus.im/sections?limit=1");
});

test("page filters are encoded, including the section slash", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { items: [], nextCursor: null, truncated: false, version: "index-v1" } }]);
  const client = createIndexClient({ baseUrl: "https://api.example.test", fetchImpl });
  await client.pages("ent_vercel.com", { section: "/docs", limit: 5, cursor: "pg_1" });
  assert.equal(
    calls[0].url,
    "https://api.example.test/api/index/v1/entities/ent_vercel.com/pages?section=%2Fdocs&limit=5&cursor=pg_1",
  );
});

test("search passes the query and optional entity scope", async () => {
  const { calls, fetchImpl } = fakeFetch([
    { body: { items: [{ id: "pg_1", type: "page", entity: "ent_vercel.com", url: "https://vercel.com/docs/cron",
      title: "Managing Cron Jobs", section: "/docs", excerpt: "x", topics: [], embedding: null, score: 0.47 }], nextCursor: null, truncated: false, version: "index-v1" } },
  ]);
  const client = createIndexClient({ baseUrl: "https://api.example.test", fetchImpl });
  const hits = await client.search({ query: "cron job", entityId: "ent_vercel.com", limit: 3 });
  assert.equal(hits.items[0].score, 0.47);
  assert.match(calls[0].url, /\/search\?q=cron\+job&entityId=ent_vercel\.com&limit=3$/);
});

test("a 404 becomes a typed error that says not to retry", async () => {
  const { fetchImpl } = fakeFetch([{ status: 404, body: { error: { code: "not_found", message: "That entity is not in the index." } } }]);
  const client = createIndexClient({ baseUrl: "https://api.example.test", fetchImpl });
  await assert.rejects(() => client.entity({ domain: "missing.example" }), (error: unknown) =>
    error instanceof IndexClientError &&
    error.code === "not_found" &&
    error.status === 404 &&
    error.retryDisposition === "correct_request_before_retry");
});

test("a 429 asks the caller to wait rather than change the request", async () => {
  const { fetchImpl } = fakeFetch([{ status: 429, body: { error: { code: "rate_limited", message: "Slow down." } } }]);
  const client = createIndexClient({ baseUrl: "https://api.example.test", fetchImpl });
  await assert.rejects(() => client.keywords("ent_x"), (error: unknown) =>
    error instanceof IndexClientError && error.retryDisposition === "wait_then_reuse_same_request_key");
});

test("an unexpected payload is rejected instead of leaking into the UI", async () => {
  const { fetchImpl } = fakeFetch([{ body: { items: "not-a-list", version: 3 } }]);
  const client = createIndexClient({ baseUrl: "https://api.example.test", fetchImpl });
  await assert.rejects(() => client.pages("ent_x"), /unexpected list shape/);
});

test("an unreachable host is an index_unavailable error, not a crash", async () => {
  const client = createIndexClient({
    baseUrl: "https://api.example.test",
    fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch,
  });
  await assert.rejects(() => client.entity({ domain: "manus.im" }), (error: unknown) =>
    error instanceof IndexClientError && error.code === "index_unavailable");
});

test("health reports coverage and queue depth", async () => {
  const payload = {
    version: "index-v1", generated_at: "2026-11-07T05:11:07.982Z",
    subjects: 186, subjects_profiled: 34, subjects_pending: 150,
    urls_total: 5958, urls_unread: 5871, urls_claimed: 0, urls_extracted: 87, urls_failed: 0,
    pages_total: 1096, pages_with_content: 6, pages_embedded: 1066,
    newest_content_at: "2026-11-07T05:10:23.554Z", oldest_content_at: "2026-11-07T05:07:06.482Z",
    content_older_than_30d: 0, content_last_7d: 6, content_coverage_pct: 0.5,
    domains: [{ domain: "docs.stripe.com", urls: 5139, extracted: 75, unread: 5064, newest_at: null, oldest_at: null }],
  };
  const { calls, fetchImpl } = fakeFetch([{ body: payload }]);
  const client = createIndexClient({ baseUrl: "https://api.example.test", fetchImpl });
  const health = await client.health();
  assert.equal(health.pages_with_content, 6);
  assert.equal(health.content_coverage_pct, 0.5);
  assert.equal(health.domains[0].unread, 5064);
  assert.equal(calls[0].url, "https://api.example.test/api/index/v1/health");
});

test("a health payload without coverage is rejected", async () => {
  const { fetchImpl } = fakeFetch([{ body: { version: "index-v1" } }]);
  const client = createIndexClient({ baseUrl: "https://api.example.test", fetchImpl });
  await assert.rejects(() => client.health(), /unexpected health shape/);
});
