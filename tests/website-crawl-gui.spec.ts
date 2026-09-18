import { test,expect } from '@playwright/test';
import { createDemoEvaluationRun } from '../src/lib/eval-verifier';
import { EVAL_SUITE, evaluationSummary, type EvaluationRun } from '../src/lib/evals';
test('crawl launch is explicit, defaults to Luna, and saved Jev evidence survives refresh',async({page})=>{
 const connection={configured:true,authorized:true,canRun:true,crawlAvailable:true,model:'gpt-5.6-luna',allowedTargets:['example.com'],usage:{remainingLiveRuns:3,liveAttemptsLast24Hours:0,activeRunId:null}};
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/auth/get-session**',r=>r.fulfill({json:{user:{id:'crawl-fixture-owner',name:'Fixture',email:'crawl@example.test',emailVerified:true},session:{id:'crawl-session-fixture',userId:'crawl-fixture-owner',expiresAt:'2099-01-01T00:00:00Z'}}}));
 await page.route('**/api/scans',r=>r.fulfill({json:{scans:[]}}));
 await page.route('**/api/agents/status',r=>r.fulfill({json:connection}));
 await page.route('**/api/seo-reports',r=>r.fulfill({json:{reports:[]}}));
 const calls:any[]=[];let saved:EvaluationRun|null=null;
 const fixture=await createDemoEvaluationRun();
 await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/,async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/evaluations'&&route.request().method()==='GET')return route.fulfill({json:{runs:saved?[evaluationSummary(saved)]:[],connection,suite:EVAL_SUITE}});
  if(u.pathname==='/api/evaluations'&&route.request().method()==='POST'){
   calls.push(route.request().postDataJSON());
   saved={...fixture,id:'crawl-fixture-run',mode:'live',workflow:'website-crawl-v1',suiteVersion:'website-crawl-v1',model:'gpt-5.6-luna',targetUrl:'https://example.com/',siteName:'Fixture website',status:'completed',result:null,captures:[],expectedFacts:undefined,crawlResult:{attemptedPages:1,reviewStatus:'completed',pages:[{id:'page-fixture',url:'https://example.com/',title:'Fixture homepage',text:'Project planning for small teams.',sha256:'fixture-hash',capturedAt:'2026-09-18T00:00:00Z',truncated:false,links:[]}],review:{model:'jev-fixture',results:[{evidenceId:'page-fixture',field:'audience',claim:'Intended audience is explicit',relation:'supports',confidence:.9}],usage:{input_tokens:100,output_tokens:10},costUsd:null}}};
   return route.fulfill({status:201,json:{run:saved}});
  }
  return route.fulfill({json:{run:saved}});
 });
 await page.goto('/evaluations?view=page');
 await page.getByLabel('Website to evaluate',{exact:true}).fill('example.com');
 const option=page.getByRole('checkbox',{name:'Crawl up to 10 pages with Luna, then review with Jev'});
 await expect(option).not.toBeChecked();await option.focus();await page.keyboard.press('Space');await expect(option).toBeChecked();expect(calls).toEqual([]);
 await page.getByRole('button',{name:'Crawl with Luna + Jev',exact:true}).click();
 await expect.poll(()=>calls.length).toBe(1);expect(calls[0]).toEqual({domain:'example.com',mode:'managed',websiteCrawl:true});
 await expect(page.getByRole('region',{name:'Website crawl report'})).toBeVisible();
 await expect(page.getByText('Explicitly covered',{exact:false})).toBeVisible();
 await page.getByText('Read saved page text',{exact:true}).click();await expect(page.getByText('Project planning for small teams.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('region',{name:'Website crawl report'})).toBeVisible();expect(calls).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
