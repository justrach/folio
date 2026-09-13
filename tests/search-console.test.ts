import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { defaultSearchConsoleRange, fetchSearchConsoleReport, listSearchConsoleProperties, SearchConsoleError,
  SEARCH_CONSOLE_MAX_REPORT_BYTES, SEARCH_CONSOLE_ROW_LIMIT } from "../src/lib/search-console";
import { assertSearchConsoleReportCapacity, getSavedSearchConsoleReport, listSavedSearchConsoleReports,
  saveSearchConsoleReport, SearchConsoleStoreError } from "../src/lib/search-console-store";
import type { SearchConsoleReportPayload } from "../src/lib/search-console-types";

const property = "https://example.com/docs/";
const now = new Date("2026-09-13T01:00:00Z");
const metric = { clicks: 7, impressions: 100, ctr: 0.07, position: 5.5 };
const sites = { siteEntry: [{ siteUrl: property, permissionLevel: "siteFullUser" }] };

function fakeProvider(onQuery?: (dimension: string | undefined) => Response): typeof fetch {
  return async (input, init) => {
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer fixture-gsc-access");
    if (String(input).endsWith("/sites")) return Response.json(sites);
    assert.equal(String(input), `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.type, "web"); assert.equal(body.dataState, "final"); assert.equal(body.startRow, 0);
    assert.deepEqual([body.startDate, body.endDate], ["2026-08-14", "2026-09-10"]);
    const dimension = body.dimensions[0] as string | undefined;
    assert.equal(body.rowLimit, dimension ? 1000 : 1);
    return onQuery?.(dimension) ?? Response.json({ rows: [{ ...metric, ...(dimension ? { keys: [dimension === "date" ? "2026-09-01" : "fixture"] } : {}) }] });
  };
}

function fixture(): SearchConsoleReportPayload {
  return { property, startDate: "2026-08-14", endDate: "2026-09-10", fetchedAt: now.toISOString(),
    totals: null, daily: [], queries: [{ ...metric, keys: ["Synthetic query fixture"] }], pages: [],
    status: "partial", warnings: ["Synthetic fixture; totals unavailable."], rowLimit: SEARCH_CONSOLE_ROW_LIMIT };
}

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of ["0001_initial.sql", "0008_search_console_reports.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob"]) sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").run(id, id, `${id}@example.test`, Date.now(), Date.now());
  const db = { prepare(sql: string) { const statement = sqlite.prepare(sql); return { bind(...values: SQLInputValue[]) { return {
    async first() { return statement.get(...values) ?? null; }, async all() { return { success: true, results: statement.all(...values) }; },
  }; } }; } } as unknown as D1Database;
  return { sqlite, db };
}

test("Search Console uses exact authorized property IDs and finalized independent dimensions", async () => {
  const report = await fetchSearchConsoleReport("fixture-gsc-access", property, { now, fetcher: fakeProvider() });
  assert.equal(report.property, property); assert.equal(report.status, "complete");
  assert.deepEqual(report.totals, metric); assert.deepEqual(report.daily[0].keys, ["2026-09-01"]);
  assert.deepEqual(report.queries[0].keys, ["fixture"]); assert.deepEqual(report.pages[0].keys, ["fixture"]);
  assert.ok(report.warnings.some(warning => warning.includes("bounded samples")));
  assert.deepEqual(defaultSearchConsoleRange(new Date("2026-01-02T00:01:00Z")), { startDate: "2025-12-03", endDate: "2025-12-30" });
  let calls = 0;
  await assert.rejects(fetchSearchConsoleReport("fixture-gsc-access", "https://evil.example/", { now, fetcher: async () => { calls++; return Response.json(sites); } }),
    (error: unknown) => error instanceof SearchConsoleError && error.status === 403);
  assert.equal(calls, 1, "An unavailable property must cause no analytics POST.");
  const listed = await listSearchConsoleProperties("fixture-gsc-access", { fetcher: async () => Response.json({ siteEntry: [...sites.siteEntry, { siteUrl: "sc-domain:other.example", permissionLevel: "siteUnverifiedUser" }] }) });
  assert.deepEqual(listed, sites.siteEntry);
});

test("failed and empty property totals remain unknown while successful dimensions are retained", async () => {
  const report = await fetchSearchConsoleReport("fixture-gsc-access", property, { now, fetcher: fakeProvider(dimension => dimension === undefined
    ? new Response("private provider diagnostic", { status: 502 })
    : Response.json({ rows: [{ ...metric, keys: [dimension === "date" ? "2026-09-01" : "fixture"] }] })) });
  assert.equal(report.status, "partial"); assert.equal(report.totals, null); assert.equal(report.queries.length, 1);
  assert.ok(report.warnings.some(warning => warning.includes("Property totals could not")));
  assert.ok(!JSON.stringify(report).includes("private provider diagnostic"));
  const empty = await fetchSearchConsoleReport("fixture-gsc-access", property, { now, fetcher: fakeProvider(() => Response.json({})) });
  assert.equal(empty.totals, null); assert.equal(empty.status, "complete"); assert.deepEqual(empty.daily, []);
});

test("row caps and the report byte limit remain explicit partial evidence", async () => {
  const report = await fetchSearchConsoleReport("fixture-gsc-access", property, { now, fetcher: fakeProvider(dimension =>
    dimension === "query" || dimension === "page"
      ? Response.json({ rows: Array.from({ length: 1000 }, (_, i) => ({ ...metric, keys: [`${i}-${"x".repeat(800)}`] })) })
      : Response.json({ rows: dimension ? [{ ...metric, keys: ["2026-09-01"] }] : [metric] })) });
  assert.equal(report.status, "partial"); assert.ok(report.warnings.some(warning => warning.includes("1000-row")));
  assert.ok(report.warnings.some(warning => warning.includes("size limit")));
  assert.ok(new TextEncoder().encode(JSON.stringify(report)).byteLength <= SEARCH_CONSOLE_MAX_REPORT_BYTES);
  assert.ok(report.queries.length > 0 && report.pages.length > 0);
});

test("oversized and invalid dimension responses fail independently without leaking errors", async () => {
  const report = await fetchSearchConsoleReport("fixture-gsc-access", property, { now, fetcher: fakeProvider(dimension => {
    if (dimension === "query") return new Response("x".repeat(SEARCH_CONSOLE_MAX_REPORT_BYTES + 1));
    if (dimension === "date") return Response.json({ rows: [{ ...metric, keys: ["2026-07-01"] }] });
    if (dimension === "page") return Response.json({ rows: [{ ...metric, ctr: 7, keys: ["fixture"] }] });
    return Response.json({ rows: [metric] });
  }) });
  assert.equal(report.status, "partial"); assert.deepEqual(report.totals, metric);
  assert.deepEqual(report.queries, []); assert.deepEqual(report.daily, []); assert.deepEqual(report.pages, []);
  await assert.rejects(fetchSearchConsoleReport("fixture-gsc-access", property, { now, fetcher: fakeProvider(() => new Response("secret upstream details", { status: 401 })) }),
    (error: unknown) => error instanceof SearchConsoleError && error.status === 401 && !error.message.includes("secret"));
  await assert.rejects(listSearchConsoleProperties("fixture-gsc-access", { fetcher: async () => { throw new Error("secret token details"); } }),
    (error: unknown) => error instanceof SearchConsoleError && !error.message.includes("secret"));
});

test("saved Search Console snapshots preserve nulls and enforce exact owner access without fetching", async t => {
  const { sqlite, db } = database(); t.after(() => sqlite.close());
  const saved = await saveSearchConsoleReport(db, "alice", { ...fixture(), accessToken: "must-not-persist" } as SearchConsoleReportPayload);
  assert.deepEqual(await getSavedSearchConsoleReport(db, "alice", saved.id), saved);
  assert.equal(await getSavedSearchConsoleReport(db, "bob", saved.id), null);
  assert.deepEqual(await listSavedSearchConsoleReports(db, "bob"), []);
  const summaries = await listSavedSearchConsoleReports(db, "alice");
  assert.equal(summaries[0].totals, null); assert.equal(summaries[0].status, "partial");
  assert.equal(Object.hasOwn(summaries[0], "queries"), false);
  assert.ok(!JSON.stringify(saved).includes("must-not-persist"));
  assert.ok(!JSON.stringify(sqlite.prepare("SELECT * FROM search_console_reports").all()).includes("must-not-persist"));
  await assert.rejects(saveSearchConsoleReport(db, "", fixture()), SearchConsoleStoreError);
  await assert.rejects(listSavedSearchConsoleReports(db, ""), SearchConsoleStoreError);
  await assert.rejects(getSavedSearchConsoleReport(db, "", saved.id), SearchConsoleStoreError);
  await assert.rejects(saveSearchConsoleReport(db, "alice", { ...fixture(), totals: { ...metric, position: NaN } }), SearchConsoleStoreError);
});

test("saved report cap preserves all observations and account deletion cascades only its own data", async t => {
  const { sqlite, db } = database(); t.after(() => sqlite.close());
  for (let i = 0; i < 50; i++) await saveSearchConsoleReport(db, "alice", fixture());
  const before = await listSavedSearchConsoleReports(db, "alice");
  await assert.rejects(assertSearchConsoleReportCapacity(db, "alice"), (error: unknown) => error instanceof SearchConsoleStoreError && error.status === 429);
  await assert.rejects(saveSearchConsoleReport(db, "alice", fixture()), SearchConsoleStoreError);
  assert.deepEqual(await listSavedSearchConsoleReports(db, "alice"), before);
  const bob = await saveSearchConsoleReport(db, "bob", fixture());
  sqlite.prepare("DELETE FROM user WHERE id=?").run("alice");
  assert.deepEqual(await listSavedSearchConsoleReports(db, "alice"), []);
  assert.equal((await getSavedSearchConsoleReport(db, "bob", bob.id))?.id, bob.id);
});
