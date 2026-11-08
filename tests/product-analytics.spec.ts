import {expect,test,type Page} from '@playwright/test';
import {demoProductEvents} from '../src/lib/product-analytics-demo';
const at='2026-11-08T10:00:00Z';
async function routes(page:Page,{enabled=true,operator=false,forbidden=false}={}){await page.addInitScript(()=>localStorage.removeItem('folio-product-analytics-opt-out'));const events:Record<string,unknown>[]=[],otherWrites:string[]=[];let reports=0;await page.route('**/api/**',async r=>{const q=r.request(),path=new URL(q.url()).pathname;if(path==='/api/analytics/config')return r.fulfill({json:{enabled}});if(path==='/api/analytics'){events.push(q.postDataJSON());return r.fulfill({status:202,json:{accepted:true}});}if(path==='/api/analytics/report'){reports++;return r.fulfill(forbidden?{status:403,json:{error:'Forbidden'}}:{json:{events:demoProductEvents(),partial:false,asOf:at}});}if(q.method()!=='GET')otherWrites.push(path);return r.fulfill({json:path==='/api/auth/get-session'?(operator?{user:{id:'operator',name:'Fixture operator',email:'operator@example.test',emailVerified:true,createdAt:at,updatedAt:at},session:{id:'fixture-session',userId:'operator',token:'fixture',expiresAt:'2099-01-01T00:00:00Z'}}:null):{sites:[],reports:[],runs:[],configured:false}});});return {events,otherWrites,get reports(){return reports;}};}
test('explicit product events omit prompt, caption, URL, query and error text',async({page})=>{const state=await routes(page);await page.goto('/overview?view=demo&target=https%3A%2F%2Fprivate.test%2Fsecret');await page.getByRole('button',{name:'Create this post',exact:true}).click();await page.getByRole('textbox',{name:'Topic or campaign idea'}).fill('PRIVATE_PROMPT_VALUE');await page.getByRole('button',{name:'Brainstorm angles',exact:true}).click();await page.getByRole('textbox',{name:'Post caption',exact:true}).fill('PRIVATE_CAPTION_VALUE');await page.getByRole('button',{name:'Save demo draft',exact:true}).click();await expect.poll(()=>state.events.some(e=>e.event==='draft_saved')).toBe(true);const text=JSON.stringify(state.events);expect(text).not.toContain('PRIVATE_');expect(text).not.toContain('private.test');expect(text).not.toContain('target');expect(state.events.find(e=>e.event==='draft_saved')?.properties).toMatchObject({area:'overview',surface:'content_demo',result:'local'});expect(state.otherWrites).toEqual([]);});
test('browser opt-out and disabled configuration send no capture requests',async({page})=>{const state=await routes(page,{enabled:false});await page.goto('/overview?view=demo');await page.getByRole('button',{name:'Create this post',exact:true}).click();await page.getByRole('button',{name:'Save demo draft',exact:true}).click();expect(state.events).toEqual([]);await page.addInitScript(()=>localStorage.setItem('folio-product-analytics-opt-out','1'));await page.reload();await page.getByRole('button',{name:'Create this post',exact:true}).click();expect(state.events).toEqual([]);});
test('sample analytics shows segmented activity and ordered journeys without reading operator data',async({page},info)=>{const state=await routes(page,{enabled:false});await page.goto('/overview?view=demo&demo=analytics');await expect(page.getByRole('heading',{name:'How are people using Folio?'})).toBeVisible();await expect(page.getByLabel('Product usage totals')).toContainText('12');await page.getByRole('button',{name:/Visitor 000001/}).click();await expect(page.getByRole('region',{name:'Selected visitor timeline'})).toContainText('website check requested');expect(state.reports).toBe(0);await page.screenshot({path:info.outputPath('product-analytics.png'),fullPage:true});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
test('forbidden operator report never substitutes sample numbers',async({page})=>{await routes(page,{enabled:false,operator:true,forbidden:true});await page.goto('/analytics');await expect(page.getByRole('alert').filter({hasText:'Analytics isn’t available'})).toContainText('Analytics isn’t available');await expect(page.getByLabel('Product usage totals')).toHaveCount(0);});
test('manager credit concept separates confirmed, reserved and unknown usage',async({page},info)=>{const state=await routes(page,{enabled:false});await page.goto('/overview?view=demo&demo=team');const totals=page.getByLabel('Sample team totals');await expect(totals).toContainText('2,074');await page.getByRole('button',{name:'Start sample task',exact:true}).click();await expect(totals).toContainText('155');await expect(totals).toContainText('2,074');await page.getByRole('button',{name:'Finish sample task',exact:true}).click();await expect(totals).toContainText('2,096');await expect(page.getByRole('region',{name:'Employee to manager walkthrough'})).toContainText('No real task ran');await page.getByRole('button',{name:'Inspect task',exact:true}).click();await expect(page.getByRole('region',{name:'Selected employee usage'})).toContainText('Usage unknown');expect(state.otherWrites).toEqual([]);await page.screenshot({path:info.outputPath('team-credits.png'),fullPage:true});});

test('collapsed sidebar website picker stays readable and inside the viewport',async({page},info)=>{
 await routes(page,{enabled:false});await page.goto('/overview?view=demo');
 if(info.project.name==='mobile')await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 else await page.locator('.app-shell').evaluate(el=>el.setAttribute('data-nav-compact','true'));
 await page.getByRole('button',{name:'Switch website',exact:true}).click();
 const picker=page.getByLabel('Saved websites', {exact:true});await expect(picker).toBeVisible();
 const box=await picker.boundingBox();expect(box!.width).toBeGreaterThan(200);
 expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
 await expect(picker.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('readable-website-picker.png')});
 await page.getByRole('button',{name:'Switch website',exact:true}).press('Escape');await expect(picker).toBeHidden();
});

test('setup completion is emitted only after a successful saved step',async({page})=>{
 const state=await routes(page,{operator:true});let success=false;
 await page.route('**/api/onboarding',async r=>{
  if(r.request().method()==='PUT')return r.fulfill(success?{json:{saved:true}}:{status:503,json:{error:'Fixture save unavailable'}});
  return r.fulfill({json:{state:{siteId:'fixture-site',audience:'',task:'',suiteId:null,competitorsSavedAt:null,baselineRequestedAt:null,completedAt:null},site:{id:'fixture-site',name:'Fixture',url:'https://private.test'},check:null,suite:null,competitors:[]}});
 });
 await page.goto('/start?step=4');await page.getByRole('textbox',{name:'Customer group 1',exact:true}).fill('PRIVATE_GROUP_VALUE');
 await page.getByRole('textbox',{name:'What they want to do'}).fill('PRIVATE_TASK_VALUE');
 await page.getByRole('button',{name:'Draft my questions',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Fixture save unavailable'})).toContainText('Fixture save unavailable');
 expect(state.events.filter(e=>e.event==='onboarding_step_completed')).toEqual([]);
 success=true;await page.getByRole('button',{name:'Draft my questions',exact:true}).click();
 await expect.poll(()=>state.events.some(e=>e.event==='onboarding_step_completed')).toBe(true);
 expect(state.events.find(e=>e.event==='onboarding_step_completed')?.properties).toMatchObject({step:4,result:'success'});
 expect(JSON.stringify(state.events)).not.toContain('PRIVATE_');
});

test('repair bundle request is tracked as sample intent without provider writes',async({page})=>{
 const state=await routes(page);await page.goto('/patches?view=demo');
 await page.getByRole('button',{name:'Approve this change',exact:true}).click();
 await page.getByRole('button',{name:/Download.*approved/i}).click();
 await expect.poll(()=>state.events.some(e=>e.event==='repair_download_requested')).toBe(true);
 expect(state.events.find(e=>e.event==='repair_download_requested')?.properties).toMatchObject({kind:'repair_bundle',surface:'repair_demo'});
 expect(state.otherWrites).toEqual([]);
});
