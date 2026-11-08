import { test, expect } from "@playwright/test";
import { publicIndexFixture } from "./public-index-fixture";
import { PUBLIC_CORE_QUERIES } from "../src/lib/public-search-rankings";

test("Index refresh uses live published observations in comparison and source answer without API writes", async ({page}) => {
  const data = structuredClone(publicIndexFixture), core=PUBLIC_CORE_QUERIES[0];
  const observed=data.observations.find(observation=>observation.queryId===core.id)!;
  const added={...structuredClone(observed),id:"live-index-fixture-update",observedAt:"2026-11-08T00:00:00.000Z",recommendations:[{position:1,name:"Live fixture site",url:"https://live-index.example",citationUrls:[]}],citations:[]};
  let updated=false;const writes:string[]=[];
  await page.route('**/api/**',route=>{
    if(route.request().method()!=='GET')writes.push(route.request().method());
    if(new URL(route.request().url()).pathname==='/api/public/benchmarks'){
      const payload=structuredClone(data);
      if(updated){payload.observations.push(added);payload.summary.publishedObservationCount++;const q=payload.queries.find(q=>q.id===core.id)!;q.latestObservation=added;q.observationCount++;payload.summary.uniqueRecommendedWebsiteCount=new Set(payload.queries.flatMap(q=>(q.latestObservation?.recommendations??[]).flatMap(r=>r.url?[new URL(r.url).hostname.replace(/^www\./,'')]:[]))).size;payload.summary.uniqueCitedSourceCount=new Set(payload.queries.flatMap(q=>(q.latestObservation?.citations??[]).map(c=>c.url))).size;}
      return route.fulfill({json:payload});
    }
    return route.fulfill({json:null});
  });
  await page.goto('/leaderboard?query='+encodeURIComponent(core.id));
  await expect(page.getByRole('region',{name:'Public search rankings'})).not.toContainText('Live fixture site');
  updated=true;await page.getByRole('button',{name:'Refresh results',exact:true}).click();
  await expect(page.getByRole('region',{name:'Public search rankings'})).toContainText('Live fixture site');
  await page.getByRole('button',{name:'Show chart',exact:true}).click();
  await expect(page.getByRole('group',{name:'Top websites by appearance rate'})).toContainText('live-index.example');
  expect(writes).toEqual([]);
});

test("Index reports unavailable live data without silently rendering the bundled cohort", async({page})=>{
  await page.route('**/api/public/benchmarks',route=>route.fulfill({status:503,json:{error:'Fixture unavailable'}}));
  await page.goto('/leaderboard?indexView=rankings');
  await expect(page.getByRole('status')).toContainText('Live results could not be refreshed');
  await expect(page.getByRole('group',{name:'Top websites by appearance rate'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Refresh results'})).toBeEnabled();
});
