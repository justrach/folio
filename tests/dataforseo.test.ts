import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSeoDataAccess,
  executeSeoTool,
  fetchSeoOverview,
  getBacklinksSummary,
  getOrganicDomainOverview,
  getSeoDataStatus,
  normalizeSeoDomain,
  SeoDataError,
} from "../src/lib/dataforseo";

const env = {
  DATAFORSEO_LOGIN: "fixture-login",
  DATAFORSEO_PASSWORD: "fixture-secret",
  DATAFORSEO_ALLOWED_USER_IDS: "approved-user,another-user",
};
const context = { userId: "approved-user" };
function envelope(result: unknown[], cost = 0.01, status = 20000) {
  return {
    version: "fixture-v1",
    status_code: 20000,
    cost,
    tasks: [
      {
        id: "fixture-task",
        status_code: status,
        cost,
        result_count: result.length,
        result,
      },
    ],
  };
}
function json(body: unknown) {
  return Response.json(body);
}
const organicResult = [
  {
    target: "example.com",
    location_code: 2840,
    language_code: "en",
    items: [
      {
        metrics: {
          organic: {
            count: 127,
            etv: 321.5,
            estimated_paid_traffic_cost: 160.2,
            pos_1: 0,
            pos_2_3: 4,
            pos_4_10: 9,
            is_new: 2,
          },
        },
      },
    ],
  },
];
const backlinksResult = [
  {
    target: "example.com",
    backlinks: 900,
    referring_domains: 71,
    referring_main_domains: 65,
    referring_pages: 321,
    rank: 38,
    broken_backlinks: 0,
  },
];

test("configuration status never exposes credentials or authorizes an arbitrary signup", async () => {
  const status = getSeoDataStatus(env, "unapproved-user");
  assert.equal(status.configured, true);
  assert.equal(status.authorized, false);
  assert.equal(status.connectionVerified, false);
  assert.ok(!JSON.stringify(status).includes("fixture-secret"));
  assert.ok(!JSON.stringify(status).includes("fixture-login"));
  let calls = 0;
  await assert.rejects(
    fetchSeoOverview(
      "example.com",
      { userId: "unapproved-user" },
      {
        env,
        fetcher: async () => {
          calls++;
          return json({});
        },
      },
    ),
    (error: unknown) => error instanceof SeoDataError && error.status === 403,
  );
  assert.equal(calls, 0);
  assert.throws(
    () =>
      assertSeoDataAccess(
        { ...env, DATAFORSEO_ALLOWED_USER_IDS: "*" },
        context,
      ),
    /not approved/,
  );
  assert.throws(
    () => assertSeoDataAccess({ ...env, DATAFORSEO_PASSWORD: "" }, context),
    /not configured/,
  );
});

test("domain normalization strips URL paths and rejects credentials, local targets and ports", () => {
  assert.equal(
    normalizeSeoDomain("https://WWW.Example.com/docs?q=private#section"),
    "example.com",
  );
  assert.equal(normalizeSeoDomain("docs.example.com"), "docs.example.com");
  for (const value of [
    "https://user:secret@example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://0x7f000001",
    "https://[::1]",
    "http://example.com:8080",
    "file:///tmp/data",
    "bad_domain.com",
    "https://metadata.google.internal",
    "*.example.com",
  ])
    assert.throws(() => normalizeSeoDomain(value), SeoDataError, value);
});

test("two independent tools use exact documented payloads and map separate response shapes", async () => {
  const requests: { url: string; body: Record<string, unknown>[] }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.equal(new URL(url).origin, "https://api.dataforseo.com");
    assert.equal(init?.redirect, "manual");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Basic ${Buffer.from("fixture-login:fixture-secret").toString("base64")}`,
    );
    requests.push({ url, body: JSON.parse(String(init?.body)) });
    return json(
      envelope(
        url.includes("domain_rank_overview") ? organicResult : backlinksResult,
        url.includes("domain_rank_overview") ? 0.0101 : 0.02003,
      ),
    );
  };
  const result = await fetchSeoOverview("www.example.com", context, {
    env,
    fetcher,
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].body, [
    {
      target: "example.com",
      location_code: 2840,
      language_code: "en",
      limit: 1,
    },
  ]);
  assert.equal(requests[1].body[0].rank_scale, "one_hundred");
  assert.equal(requests[1].body[0].backlinks_status_type, "live");
  assert.equal(result.organic.data?.organicKeywords, 127);
  assert.equal(result.organic.data?.estimatedMonthlyTraffic, 321.5);
  assert.equal(result.backlinks.data?.backlinks, 900);
  assert.equal(result.backlinks.data?.referringDomains, 71);
  assert.equal(result.backlinks.data?.authorityRank, 38);
  assert.equal(result.organic.data?.positions[0].count, 0);
  assert.equal(result.organic.data?.positions[3].count, null);
  assert.equal(result.backlinks.data?.crawledPages, null);
  assert.ok(Math.abs(result.totalCostUsd! - 0.03013) < 1e-8);
  assert.ok(!JSON.stringify(result).includes("fixture-secret"));
});

test("a charged backlinks failure preserves successful organic data and provider cost", async () => {
  const result = await fetchSeoOverview("example.com", context, {
    env,
    fetcher: async (input) =>
      String(input).includes("domain_rank_overview")
        ? json(envelope(organicResult, 0.01))
        : json({
            ...envelope([], 0.02, 40200),
            status_message: "fixture-secret must never be echoed",
          }),
  });
  assert.equal(result.status, "partial");
  assert.equal(result.organic.status, "success");
  assert.equal(result.backlinks.status, "error");
  assert.equal(result.backlinks.costUsd, 0.02);
  assert.equal(result.backlinks.error?.providerStatusCode, 40200);
  assert.equal(result.totalCostUsd, 0.03);
  assert.ok(!JSON.stringify(result).includes("fixture-secret"));
});

test("unknown HTTP failure cost is not treated as free and redirects are not followed", async () => {
  let calls = 0;
  const result = await fetchSeoOverview("example.com", context, {
    env,
    fetcher: async (input) => {
      calls++;
      return String(input).includes("domain_rank_overview")
        ? json(envelope(organicResult, 0.01))
        : new Response("fixture-secret", {
            status: 302,
            headers: { location: "https://attacker.example" },
          });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "partial");
  assert.equal(result.backlinks.costUsd, null);
  assert.equal(result.totalCostUsd, null);
  assert.equal(result.knownCostUsd, 0.01);
  assert.equal(result.costIsComplete, false);
  assert.equal(result.backlinks.error?.httpStatus, 302);
  assert.ok(!JSON.stringify(result).includes("fixture-secret"));
});

test("timeout produces an uncertain cost without retrying the potentially paid request", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    calls++;
    return new Promise((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () =>
        reject(new Error("fixture-secret")),
      ),
    );
  };
  const result = await getOrganicDomainOverview("example.com", context, {
    env,
    fetcher,
    timeoutMs: 5,
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "error");
  assert.equal(result.error?.code, "TIMEOUT");
  assert.equal(result.costUsd, null);
  assert.equal(result.error?.retryAutomatically, false);
});

test("empty provider results remain empty and valid zero metrics stay zero", async () => {
  const empty = await getOrganicDomainOverview("example.com", context, {
    env,
    fetcher: async () => json(envelope([{ items: [] }])),
  });
  assert.equal(empty.status, "empty");
  assert.equal(empty.data, null);
  const zero = await getBacklinksSummary("example.com", context, {
    env,
    fetcher: async () =>
      json(envelope([{ backlinks: 0, referring_domains: 0, rank: 0 }])),
  });
  assert.equal(zero.status, "success");
  assert.equal(zero.data?.backlinks, 0);
});

test("both envelope and task status must succeed; malformed or oversized bodies are rejected", async () => {
  const rejected = await getOrganicDomainOverview("example.com", context, {
    env,
    fetcher: async () =>
      json({ ...envelope(organicResult), status_code: 40000 }),
  });
  assert.equal(rejected.status, "error");
  const oversized = await getBacklinksSummary("example.com", context, {
    env,
    fetcher: async () => new Response("a".repeat(1_000_001)),
  });
  assert.equal(oversized.status, "error");
  assert.equal(oversized.error?.code, "INVALID_RESPONSE");
  assert.equal(oversized.costUsd, null);
});

test("tool arguments cannot override the server-authenticated account or endpoint", async () => {
  let calls = 0;
  await assert.rejects(
    executeSeoTool(
      "seo_domain_overview",
      { domain: "example.com", userId: "approved-user" },
      context,
      {
        env,
        fetcher: async () => {
          calls++;
          return json({});
        },
      },
    ),
    /only a domain/,
  );
  assert.equal(calls, 0);
});
