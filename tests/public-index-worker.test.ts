import assert from "node:assert/strict";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import worker from "../workers/public-index";

function fixture() {
  const models = ["model-a", "model-b"].map((model, index) => ({ model, plannedAnswers: 1, completedAnswers: 1, failedAnswers: 0, unresolvedAnswers: 0,
    trackedCompanies: [{ name: "Acme", mentionedAnswers: index === 0 ? 1 : 0, promptedQuestions: 0, aliases: ["PRIVATE_ALIAS"] }],
    answer: "PRIVATE_ANSWER", sessionId: "PRIVATE_SESSION", inputTokens: 123,
  }));
  return { id: "cohort", name: "Public cohort", completedAt: "2026-09-17T00:00:00Z", version: "prompt-answers-v1", repeats: 1, questionCount: 1,
    questions: ["Which tool works?"], models, questionResults: [{ questionIndex: 0, models, ownerId: "PRIVATE_OWNER" }], ownerId: "PRIVATE_OWNER" };
}
function database(rows: unknown[]) {
  const queries: string[] = [];
  return { queries, env: { DB: { prepare(sql: string) {
    queries.push(sql);
    return { async all() { return { results: rows.map(row => ({ summary_json: JSON.stringify(row) })) }; } };
  } } as unknown as D1Database } };
}

test("public worker allowlists query summaries and rereads snapshots after withdrawal", async () => {
  const rows: unknown[] = [fixture()];
  const { env, queries } = database(rows);
  const response = await worker.fetch(new Request("https://usefolio.site/api/question-index"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.doesNotMatch(text, /PRIVATE_|aliases|sessionId|inputTokens|ownerId|"answer"/);
  const { experiments } = JSON.parse(text);
  assert.equal(experiments[0].questionResults[0].models[0].trackedCompanies[0].mentionedAnswers, 1);
  rows.splice(0);
  assert.deepEqual(await (await worker.fetch(new Request("https://usefolio.site/api/question-index"), env)).json(), { experiments: [] });
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => query.startsWith("SELECT summary_json FROM published_question_snapshots")));
});

test("public worker renders per-question ranks with selected-model denominators and escaped text", async () => {
  const data = fixture();
  data.questions[0] = '<script>alert("bad")</script>';
  const { env } = database([data]);
  const all = await (await worker.fetch(new Request("https://usefolio.site/leaderboard"), env)).text();
  const querySection = all.slice(all.indexOf('<section class="detail" aria-label="Rankings for each question">'));
  assert.match(querySection, /50\.0%/);
  assert.match(querySection, /2\/2 answers complete/);
  assert.match(querySection, /&lt;script&gt;/);
  assert.doesNotMatch(all, /<script>/);
  const single = await (await worker.fetch(new Request("https://usefolio.site/leaderboard?model=model-b"), env)).text();
  const singleSection = single.slice(single.indexOf('<section class="detail" aria-label="Rankings for each question">'));
  assert.match(singleSection, /0\.0%/);
  assert.match(singleSection, /1\/1 answers complete/);
  assert.match(singleSection, /<td>1<\/td>/, "measured zero is ranked");
  assert.match(single, /form action="\/leaderboard"/);
});

test("legacy cohorts explicitly omit query ranks and missing query records stay unmeasured", async () => {
  const data: Record<string, unknown> = fixture();
  delete data.questionResults;
  const { env } = database([data]);
  const body = await (await worker.fetch(new Request("https://usefolio.site/leaderboard"), env)).text();
  assert.match(body, /aggregate results only/);
  const payload = await (await worker.fetch(new Request("https://usefolio.site/api/question-index"), env)).json() as { experiments: object[] };
  assert.equal("questionResults" in payload.experiments[0], false);
  data.questionResults = [];
  const missing = await (await worker.fetch(new Request("https://usefolio.site/leaderboard"), env)).text();
  assert.match(missing, /No valid query-level result was shared/);
});

test("worker rejects writes and unknown routes without querying D1; HEAD is bodyless", async () => {
  const { env, queries } = database([fixture()]);
  assert.equal((await worker.fetch(new Request("https://usefolio.site/api/question-index", { method: "POST" }), env)).status, 405);
  assert.equal((await worker.fetch(new Request("https://usefolio.site/private"), env)).status, 404);
  assert.equal(queries.length, 0);
  const head = await worker.fetch(new Request("https://usefolio.site/leaderboard", { method: "HEAD" }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("malformed published counts fail closed without echoing stored content", async () => {
  const data = fixture();
  data.questionResults[0].models[0].completedAnswers = -1;
  const { env } = database([data]);
  const response = await worker.fetch(new Request("https://usefolio.site/api/question-index"), env);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /PRIVATE_|Public cohort/);
});

test('main index routes to Folio while legacy cohorts and their API stay read-only',async()=>{
 const db=database([fixture()]); const calls:string[]=[];
 const env={...db.env,FOLIO_APP:{async fetch(request:Request){calls.push(request.url);return new Response('model landscape')}}};
 const main=await worker.fetch(new Request('https://usefolio.site/leaderboard?model=gpt-5.6-luna'),env);
 assert.equal(await main.text(),'model landscape');assert.equal(db.queries.length,0);
 for(const path of ['/leaderboard?view=questions','/leaderboard?cohort=cohort','/api/question-index']){
  const response=await worker.fetch(new Request(`https://usefolio.site${path}`),env);assert.equal(response.status,200);assert.notEqual(await response.text(),'model landscape');
 }
 assert.equal(calls.length,1);
 const post=await worker.fetch(new Request('https://usefolio.site/leaderboard',{method:'POST'}),env);assert.equal(post.status,405);assert.equal(calls.length,1);
});
