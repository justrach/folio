import { test, expect } from "@playwright/test";
test("cost summary distinguishes unknown, estimates and reports; reads never launch work",async({page})=>{
 let reads=0;const mutations:string[]=[];
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){mutations.push(path);return route.fulfill({status:400,json:{error:'Unexpected mutation'}});}
  if(path==='/api/auth/get-session')return route.fulfill({json:{user:{id:'alice',name:'Fixture owner',email:'alice@example.test'},session:{id:'session-fixture',userId:'alice',expiresAt:'2099-01-01T00:00:00Z'}}});
  if(path==='/api/plans')return route.fulfill({json:{interest:null}});
  if(path==='/api/costs'){reads++;return route.fulfill({json:{currency:'USD',recent:[],recentLimit:50,groups:[
   {source:'keyword',provider:'openai',model:'gpt-6-astra',runs:3,estimated_runs:2,unknown_runs:1,estimated_token_micros:123456,reported_known_micros:null,reported_complete_runs:0,input_tokens:1000,output_tokens:200},
   {source:'seo',provider:'dataforseo',model:null,runs:1,estimated_runs:0,unknown_runs:1,estimated_token_micros:null,reported_known_micros:12000,reported_complete_runs:0,input_tokens:null,output_tokens:null}
  ]}});}
  return route.fulfill({json:{}});
 });
 await page.goto('/pricing');const panel=page.getByRole('region',{name:'What your runs cost'});
 await expect(panel).toBeVisible();await expect(panel).toContainText('$0.1235');await expect(panel).toContainText('Unknown');
 await expect(panel).toContainText('not invoice-confirmed');
 const before=reads;await panel.getByRole('button',{name:'Refresh costs'}).click();await expect.poll(()=>reads).toBe(before+1);
 await expect(panel).toContainText('$0.012');expect(mutations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
test("signed-out visitors cannot see a previous owner's cost panel",async({page})=>{
 const reads:string[]=[];await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;reads.push(path);return route.fulfill({json:null});});
 await page.goto('/pricing');await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'What your runs cost'})).toHaveCount(0);expect(reads).not.toContain('/api/costs');
});
