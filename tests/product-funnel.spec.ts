import {expect,test} from '@playwright/test';
import {selectValue} from './select-helpers';

test('funnel preserves counts, supports keyboard and touch, and reopens its selected journey',async({page},info)=>{
 const writes:string[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>{const q=r.request(),path=new URL(q.url()).pathname;if(q.method()!=='GET')writes.push(path);return r.fulfill({json:path==='/api/auth/get-session'?null:path==='/api/analytics/config'?{enabled:false}:{sites:[],scans:[],reports:[],runs:[],configured:false}});});
 await page.goto('/overview?view=demo&demo=analytics&journey=research');
 let chart=page.getByRole('figure',{name:'Website research funnel',exact:true});
 await expect(chart).toBeVisible();await expect(chart.locator('figcaption')).toContainText('25%');
 const stages=chart.locator('.product-funnel-stage-grid button');
 await expect(stages).toHaveCount(5);await expect(stages.nth(0)).toContainText('12');
 await stages.nth(0).focus();await stages.nth(0).press('ArrowRight');await expect(stages.nth(1)).toBeFocused();await expect(stages.nth(1)).toHaveAttribute('aria-pressed','true');
 await stages.nth(1).press('End');await expect(stages.nth(4)).toBeFocused();
 await expect(chart.locator('.product-funnel-reading')).toContainText('Evidence requested');
 await chart.getByText('View stage data',{exact:true}).click();await expect(chart.getByRole('table')).toContainText('Kept from previous');
 await selectValue(page.getByRole('combobox',{name:'Tracked journey',exact:true}),'content');
 chart=page.getByRole('figure',{name:'Content demo funnel',exact:true});await expect(chart).toBeVisible();await expect(chart.locator('figcaption')).toContainText('33.3%');
 await expect(page).toHaveURL(/journey=content/);await page.reload();await expect(page.getByRole('figure',{name:'Content demo funnel',exact:true}).locator('figcaption')).toContainText('33.3%');
 await expect(page.locator('.product-admin-art')).toHaveAttribute('src','/images/admin/observation-path-v1.webp');
 if(info.project.name==='mobile')await expect(chart.locator('.product-funnel-band')).toBeHidden();else await expect(chart.locator('.product-funnel-band')).toBeVisible();
 expect(writes).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('admin-funnel-light.png'),fullPage:true});
 await page.evaluate(()=>localStorage.setItem('folio-dashboard-appearance','dark'));await page.reload();await expect(page.locator('html')).toHaveAttribute('data-folio-theme','dark');await expect(page.getByRole('figure',{name:'Content demo funnel'})).toBeVisible();await page.screenshot({path:info.outputPath('admin-funnel-dark.png'),fullPage:true});expect(errors).toEqual([]);
});

test('compact dark navigation keeps every nested icon inside its rail',async({page},info)=>{
 await page.addInitScript(()=>{localStorage.setItem('folio-product-analytics-opt-out','1');localStorage.setItem('folio-dashboard-appearance','dark');});
 await page.route('**/api/**',r=>r.fulfill({json:new URL(r.request().url()).pathname==='/api/auth/get-session'?null:{sites:[],scans:[],runs:[],configured:false}}));
 await page.goto('/seo?view=demo');await expect(page.locator('html')).toHaveAttribute('data-folio-theme','dark');
 if(info.project.name==='mobile')await page.getByRole('button',{name:'Open navigation',exact:true}).click();else await page.locator('.app-shell').evaluate(el=>el.setAttribute('data-nav-compact','true'));
 const sidebar=page.locator('.sidebar');if(info.project.name==='mobile')await expect.poll(()=>sidebar.evaluate(el=>Math.round(el.getBoundingClientRect().left))).toBe(0);const bounds=await sidebar.boundingBox();
 const links=page.locator('.sidebar-more nav .nav-link');await expect(links.first()).toBeVisible();
 for(const link of await links.all()){const box=await link.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);expect(box!.x+box!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('compact-navigation-dark.png')});
});
