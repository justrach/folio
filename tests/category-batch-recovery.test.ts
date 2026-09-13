import test from "node:test";
import assert from "node:assert/strict";
import { findCategoryReceipts } from "../scripts/category-batch-recovery";

const runs = [{ id: "run_fixture", caseId: "case_fixture" }];
const candidate = { id: "session_fixture", metadata: { run_id: "run_fixture", case_id: "case_fixture" } };
const env = { OPENAI_API_KEY: "synthetic-fixture" };
test("receipt discovery follows bounded GET pagination and keeps only exact run/case identities", async () => {
  const urls: string[] = [];
  const result = await findCategoryReceipts(runs, env, { fetcher: async (url, init) => {
    assert.equal(init?.method, "GET"); urls.push(String(url));
    return Response.json(urls.length === 1
      ? { data: [{ ...candidate, metadata: { ...candidate.metadata, case_id: "other" } }], has_more: true, last_id: "cursor_fixture" }
      : { data: [candidate], has_more: false });
  } });
  assert.equal(result.complete, true); assert.equal(result.checked, 2); assert.deepEqual(result.candidates, [candidate]);
  assert.ok(urls[1].endsWith("&after=cursor_fixture"));
});
test("incomplete, failed and repeated-cursor discovery cannot authorize attaching partial matches", async () => {
  for (const mode of ["bounded", "failed", "cursor-loop"] as const) {
    let calls = 0;
    const result = await findCategoryReceipts(runs, env, { maxPages: mode === "bounded" ? 1 : 4, fetcher: async (_url, init) => {
      assert.equal(init?.method, "GET"); calls++;
      if (mode === "failed" && calls > 1) return new Response(null, { status: 500 });
      return Response.json({ data: [candidate], has_more: true, last_id: "same_cursor" });
    } });
    assert.equal(result.complete, false); assert.deepEqual(result.candidates, []);
    assert.equal(calls, mode === "bounded" ? 1 : 2);
  }
});
test("receipt discovery preserves duplicate matches for rejection and does nothing for an empty queue", async () => {
  const result = await findCategoryReceipts(runs, env, { fetcher: async () => Response.json({ data: [candidate, { ...candidate, id: "second_session" }], has_more: false }) });
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(await findCategoryReceipts([], env, { fetcher: async () => { throw Error("No requests expected"); } }), { complete: true, checked: 0, candidates: [] });
});
