import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCrawlPage, crawlUrl, crawlReviewRequest, validateCrawlFinal } from '../src/lib/website-crawl';
import { createEvaluationBundle } from '../src/lib/eval-store';
import { createDemoEvaluationRun } from '../src/lib/eval-verifier';
test('crawl excerpt and discovered link bounds fit saved reports',()=>{
 const html='<p>'+('x'.repeat(20000))+'</p>'+Array.from({length:80},(_,i)=>`<a href="/p${i}?q=${'x'.repeat(1800)}">Link</a>`).join('');
 const p={...extractCrawlPage(html,'https://example.com/','page'),sha256:'fixture'};
 assert.equal(p.text.length,6000);assert.equal(p.truncated,true);assert.ok(p.links.join('').length<=12000);
 const pages=Array.from({length:10},(_,i)=>({...p,id:`page-${i}`}));
 assert.ok(JSON.stringify(crawlReviewRequest(pages)).length<=100000);
 assert.ok(JSON.stringify({pages}).length<250000);
});
test('crawl URLs and extracted links retain same-site origin and honor base',()=>{
 for(const u of ['http://example.com/','https://example.com:8443/','https://evil.example.com/','https://user:pass@example.com/','https://127.0.0.1/'])assert.throws(()=>crawlUrl(u,'https://example.com/'));
 assert.equal(crawlUrl('https://example.com/a#section','https://example.com/'),'https://example.com/a');
 const p=extractCrawlPage('<base href="/docs/"><a data-href="/fake">Fake</a><a href="pricing?a=1&amp;b=2">Price</a>','https://example.com/','p');
 assert.deepEqual(p.links,['https://example.com/docs/pricing?a=1&b=2']);
 assert.deepEqual(extractCrawlPage('<base href="https://elsewhere.com/"><a href="relative">External</a>','https://example.com/','p').links,[]);
});
test('crawl reports have a distinct export and cannot invent completed evidence',async()=>{
 const run={...await createDemoEvaluationRun(),workflow:'website-crawl-v1' as const};
 assert.equal(createEvaluationBundle(run).format,'folio-private-crawl-bundle-v1');
 assert.throws(()=>validateCrawlFinal('{"workflow":"website-crawl-v1","pageIds":[],"limitations":[]}',{pages:[],attemptedPages:0,reviewStatus:'completed',review:null}));
});
