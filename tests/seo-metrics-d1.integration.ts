import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { completeSeoReport, latestDomainSeoMetrics, reserveSeoReport } from "../src/lib/seo-store";
import type { SeoOverviewResult } from "../src/lib/dataforseo";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"), workers: [{ config: {
      name: "folio-seo-metrics-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000031" } },
    } }] });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const owner of ["alice", "bob"])
    await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(owner, owner, `${owner}@example.test`, Date.now(), Date.now()).run();
}
function result(domain: string, fetchedAt: string, rank: number | null, scale = 100, organicOk = true) {
  const observation = (data: unknown) => ({ status: "success", data, error: null, costUsd: null, taskId: null, providerVersion: null, endpoint: "fixture", fetchedAt });
  return { id: crypto.randomUUID(), domain, provider: "DataForSEO", fetchedAt, status: organicOk ? "complete" : "partial", totalCostUsd: null, knownCostUsd: 0, costIsComplete: false, notes: [],
    organic: organicOk ? observation({ organicKeywords: 120, estimatedMonthlyTraffic: 3400.5 }) : { ...observation(null), status: "error" },
    backlinks: observation({ backlinks: 900, referringDomains: 75, authorityRank: rank, authorityRankScale: scale }) } as unknown as SeoOverviewResult;
}

test("actual D1 reads the latest saved DataForSEO metrics per domain, per owner, without provider calls", { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-seo-metrics-d1-"));
  const current = runtime(directory);
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const save = async (owner: string, domain: string, at: string, rank: number | null, scale = 100, organicOk = true) =>
      completeSeoReport(db, owner, (await reserveSeoReport(db, owner, domain)).id, result(domain, at, rank, scale, organicOk));
    await save("alice", "example.com", "2026-10-01T00:00:00.000Z", 31);
    const latest = await save("alice", "example.com", "2026-10-05T00:00:00.000Z", 34, 100, false);
    await save("alice", "other.org", "2026-10-02T00:00:00.000Z", 250, 1000);
    await reserveSeoReport(db, "alice", "pending.net");
    await save("bob", "example.com", "2026-10-09T00:00:00.000Z", 99);
    const metrics = await latestDomainSeoMetrics(db, "alice", ["https://www.example.com/", "other.org", "pending.net", "not a domain"]);
    assert.deepEqual([...metrics.keys()].sort(), ["example.com", "other.org"]);
    assert.deepEqual(metrics.get("example.com"), { domain: "example.com", reportId: latest.id, retrievedAt: "2026-10-05T00:00:00.000Z",
      domainRank: 34, referringDomains: 75, backlinks: 900, organicKeywords: null, estimatedMonthlyTraffic: null });
    assert.equal(metrics.get("other.org")!.domainRank, null, "a non-0–100 scale is never shown as Domain Rank");
    assert.equal((await latestDomainSeoMetrics(db, "bob", ["example.com"])).get("example.com")!.domainRank, 99);
    assert.equal((await latestDomainSeoMetrics(db, "carol", ["example.com"])).size, 0);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
