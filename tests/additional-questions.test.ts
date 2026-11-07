import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PUBLIC_SEARCH_RANKINGS, PUBLIC_SEARCH_PROGRESS } from "../src/lib/public-search-rankings";
import { buildPublicDashboard } from "../src/lib/public-dashboard";
import { websiteQuestionDrafts } from "../src/lib/website-question-drafts";
import { parseQuestionSuiteInput } from "../src/lib/question-suite-input";
test("authored question libraries are unrun; frozen batch and published observations are preserved", async()=>{
 const frozen=JSON.parse(await readFile(new URL("../src/data/public-search-rankings.json",import.meta.url),"utf8"));
 assert.equal(frozen.queries.length,3500);assert.equal(PUBLIC_SEARCH_RANKINGS.queries.length,4050);
 assert.deepEqual(PUBLIC_SEARCH_RANKINGS.observations,frozen.observations);
 const dashboard=buildPublicDashboard(PUBLIC_SEARCH_RANKINGS,PUBLIC_SEARCH_PROGRESS);
 const added=dashboard.queries.filter(q=>q.id.includes("-decision-"));assert.equal(added.length,350);
 assert.ok(added.every(q=>q.collection.status==='not-started' && q.observationCount===0));
 const aiTools=dashboard.queries.filter(q=>q.audience==='AI tools');assert.equal(aiTools.length,200);
 assert.ok(aiTools.every(q=>q.collection.status==='not-started' && q.observationCount===0));
 assert.equal(new Set(PUBLIC_SEARCH_RANKINGS.queries.map(q=>q.query)).size,4050);
});
test("ten website drafts fit a real saved suite even at maximum context lengths",()=>{
 const questions=websiteQuestionDrafts('a'.repeat(60),'b'.repeat(120));
 const result=parseQuestionSuiteInput({name:'Fixture',websiteId:'site-fixture',questions,language:'en',locale:'en-US'});
 assert.equal(result.questions.length,10);
});
