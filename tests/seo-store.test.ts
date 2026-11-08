import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { fetchSeoOverview, fetchSeoDetail, type SeoDetailResult, type SeoOverviewResult } from "../src/lib/dataforseo";
import { reserveSeoReport, completeSeoReport, saveSeoReportDetail, getOwnedSeoReport, listOwnedSeoReports, SeoStoreError } from "../src/lib/seo-store";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0001_initial.sql", "0004_seo_reports.sql", "0024_seo_report_detail.sql"])
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob"])
    sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run(id, id, `${id}@example.com`, Date.now(), Date.now());
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values: SQLInputValue[]) {
          return {
            async run() { return { success: true, meta: { changes: Number(statement.run(...values).changes) } }; },
            async first() { return statement.get(...values) ?? null; },
            async all() { return { success: true, results: statement.all(...values) }; },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, sqlite };
}

async function fixtureResult(): Promise<SeoOverviewResult> {
  return fetchSeoOverview("example.com", { userId: "alice" }, {
    env: { DATAFORSEO_LOGIN: "fixture-login", DATAFORSEO_PASSWORD: "fixture-password", DATAFORSEO_ALLOWED_USER_IDS: "alice" },
    fetcher: async (input) => String(input).includes("backlinks")
      ? new Response("ambiguous gateway failure", { status: 502 })
      : Response.json({ status_code: 20000, cost: 0.01, tasks: [{ status_code: 20000, cost: 0.01, id: "fixture-task", result: [] }] }),
  });
}

test("saved SEO report IDs, list and completion are private to their account", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const reserved = await reserveSeoReport(db, "alice", "https://www.example.com");
  assert.equal(reserved.domain, "example.com");
  const result = await fixtureResult();
  await assert.rejects(completeSeoReport(db, "bob", reserved.id, result), SeoStoreError);
  const saved = await completeSeoReport(db, "alice", reserved.id, result);
  assert.equal(saved.publication, "private");
  assert.equal(saved.retrievedAt, result.fetchedAt);
  assert.equal(await getOwnedSeoReport(db, "bob", saved.id), null);
  assert.deepEqual(await listOwnedSeoReports(db, "bob"), []);
  assert.deepEqual((await getOwnedSeoReport(db, "alice", saved.id))?.result, result);
  assert.equal((await listOwnedSeoReports(db, "alice"))[0].id, saved.id);
  assert.equal(Object.hasOwn(saved, "ownerId"), false);
  assert.equal(Object.hasOwn(saved, "user_id"), false);
  assert.ok(!JSON.stringify(saved).includes("fixture-password"));
  assert.ok(!JSON.stringify(saved).includes("fixture-login"));
});

test("partial provider failure and unknown cost survive persistence and reopening exactly", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const reserved = await reserveSeoReport(db, "alice", "example.com");
  const result = await fixtureResult();
  assert.equal(result.status, "partial");
  assert.equal(result.organic.status, "empty");
  assert.equal(result.backlinks.status, "error");
  assert.equal(result.totalCostUsd, null);
  const saved = await completeSeoReport(db, "alice", reserved.id, result);
  assert.deepEqual(saved.result, result);
  const summary = (await listOwnedSeoReports(db, "alice"))[0];
  assert.equal(summary.status, "partial");
  assert.equal(summary.totalCostUsd, null);
  assert.equal(summary.knownCostUsd, 0.01);
  assert.equal(summary.costIsComplete, false);
});

test("interrupted paid lookups retain an unconfirmed record without inventing zero cost", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const report = await reserveSeoReport(db, "alice", "example.com");
  assert.equal(report.state, "pending");
  assert.equal(report.result, null);
  const summary = (await listOwnedSeoReports(db, "alice"))[0];
  assert.equal(summary.status, "unconfirmed");
  assert.equal(summary.retrievedAt, null);
  assert.equal(summary.totalCostUsd, null);
  assert.equal(summary.knownCostUsd, null);
  assert.equal(summary.costIsComplete, false);
});

test("saved observations cannot be overwritten or completed using another domain", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const report = await reserveSeoReport(db, "alice", "example.com");
  const result = await fixtureResult();
  await assert.rejects(completeSeoReport(db, "alice", report.id, { ...result, domain: "other.example.com" }), SeoStoreError);
  await completeSeoReport(db, "alice", report.id, result);
  await assert.rejects(completeSeoReport(db, "alice", report.id, { ...result, totalCostUsd: 0 }), SeoStoreError);
  assert.deepEqual((await getOwnedSeoReport(db, "alice", report.id))?.result, result);
});

test("history is bounded, excludes full observations, and account deletion cascades", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  for (let i = 0; i < 55; i++) await reserveSeoReport(db, "alice", "example.com");
  const bob = await reserveSeoReport(db, "bob", "example.com");
  const list = await listOwnedSeoReports(db, "alice");
  assert.equal(list.length, 50);
  assert.ok(list.every(item => !Object.hasOwn(item, "result")));
  assert.ok(list.every(item => item.id !== bob.id));
  sqlite.prepare("DELETE FROM user WHERE id = ?").run("alice");
  assert.deepEqual(await listOwnedSeoReports(db, "alice"), []);
  assert.equal((await getOwnedSeoReport(db, "bob", bob.id))?.id, bob.id);
});

test("empty authenticated owner IDs never bypass private report checks", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  await assert.rejects(reserveSeoReport(db, "", "example.com"), SeoStoreError);
  await assert.rejects(listOwnedSeoReports(db, ""), SeoStoreError);
  await assert.rejects(getOwnedSeoReport(db, "", "any"), SeoStoreError);
});

async function fixtureDetail(): Promise<SeoDetailResult> {
  return fetchSeoDetail("example.com", { userId: "alice" }, {
    env: { DATAFORSEO_LOGIN: "fixture-login", DATAFORSEO_PASSWORD: "fixture-password", DATAFORSEO_ALLOWED_USER_IDS: "alice" },
    fetcher: async (input) => String(input).includes("ranked_keywords")
      ? Response.json({ status_code: 20000, cost: 0.01, tasks: [{ status_code: 20000, cost: 0.01, id: "fixture-task", result: [{ items: [{ keyword_data: { keyword: "example pricing", keyword_info: { search_volume: 900 } }, ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://example.com/pricing", etv: 4.5 } } }] }] }] })
      : Response.json({ status_code: 20000, cost: 0.02, tasks: [{ status_code: 20000, cost: 0.02, id: "fixture-task", result: [{ items: [{ url_from: "https://source.example/post", domain_from: "source.example", rank: 55 }] }] }] }),
  });
}

test("row-level detail is saved once, owner-scoped, and never inside the aggregate history list", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const reserved = await reserveSeoReport(db, "alice", "example.com");
  const detail = await fixtureDetail();
  // A pending report has no aggregate observation to attach rows to.
  await assert.rejects(saveSeoReportDetail(db, "alice", reserved.id, detail), SeoStoreError);
  const saved = await completeSeoReport(db, "alice", reserved.id, await fixtureResult());
  assert.equal(saved.detail, null);
  assert.equal(saved.detailRetrievedAt, null);
  await assert.rejects(saveSeoReportDetail(db, "bob", saved.id, detail), SeoStoreError);
  const withDetail = await saveSeoReportDetail(db, "alice", saved.id, detail);
  assert.equal(withDetail.detail?.keywords.data?.rows[0].keyword, "example pricing");
  assert.equal(withDetail.detailRetrievedAt, detail.collectedAt);
  assert.equal(withDetail.result?.domain, "example.com");
  // A second collection would be another paid request and is refused here.
  await assert.rejects(saveSeoReportDetail(db, "alice", saved.id, detail), SeoStoreError);
  assert.equal((await getOwnedSeoReport(db, "alice", saved.id))?.detail?.backlinks.data?.rows.length, 1);
  assert.deepEqual(await listOwnedSeoReports(db, "bob"), []);
  const summary = (await listOwnedSeoReports(db, "alice"))[0];
  assert.equal(summary.detailState, "collected");
  assert.equal(Object.hasOwn(summary, "detail"), false);
  assert.ok(!JSON.stringify(summary).includes("source.example"));
});

test("detail rows cannot be attached to a report for a different domain", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const reserved = await reserveSeoReport(db, "alice", "example.com");
  const saved = await completeSeoReport(db, "alice", reserved.id, await fixtureResult());
  const detail = await fixtureDetail();
  await assert.rejects(
    saveSeoReportDetail(db, "alice", saved.id, { ...detail, domain: "other.example.com" }),
    SeoStoreError,
  );
  assert.equal((await getOwnedSeoReport(db, "alice", saved.id))?.detail, null);
});
