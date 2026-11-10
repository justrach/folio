import {expect,test,type Page} from '@playwright/test';
import {evaluateHtml} from '../src/lib/evaluation';

async function audit(page:Page,empty:boolean){
 const user={id:'seo-layout-owner',name:'Audit reviewer',email:'audit@example.test',emailVerified:true,createdAt:'2026-09-13T00:00:00Z',updatedAt:'2026-09-13T00:00:00Z'};
 const scan={...evaluateHtml('<html><head><title>Saved technical audit for a website with a long title</title></head><body><h1>Website</h1><p>Captured evidence.</p></body></html>','https://example.com/'),id:'layout-audit',url:'https://example.com/',createdAt:'2026-09-13T09:00:00Z'};
 if(empty){scan.checks=[];scan.seoScore=61;}
 const writes:string[]=[];
 await page.route('**/api/**',route=>{
  const q=route.request(),path=new URL(q.url()).pathname;
  if(q.method()!=='GET'){writes.push(path);return route.fulfill({status:409,json:{error:'No writes during review'}});}
  return route.fulfill({json:path==='/api/auth/get-session'?{user,session:{id:'layout-session',userId:user.id,token:'fixture',expiresAt:'2099-01-01T00:00:00Z'}}:path==='/api/scans'?{scans:[scan]}:{configured:false,sites:[],runs:[],reports:[]}});
 });
 await page.addInitScript(()=>localStorage.setItem('folio-dashboard-navigation','expanded'));
 await page.goto('/seo');await expect(page.locator('.seo-audit-score')).toContainText(String(scan.seoScore));return writes;
}

test('audit with missing checks shows an honest recovery state without zero-percent charts',async({page})=>{
 const writes=await audit(page,true);
 await expect(page.getByRole('heading',{name:'Check details unavailable',exact:true})).toBeVisible();
 await expect(page.getByRole('group',{name:'Check breakdown'})).toHaveCount(0);
 await expect(page.getByRole('group',{name:'Filter checks'})).toHaveCount(0);
 await expect(page.locator('.seo-audit-score')).toContainText('Saved score');
 await page.getByRole('button',{name:'Check this page again',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();expect(writes).toEqual([]);
});

test('score, findings and action fit narrow and desktop layouts in both themes',async({page},info)=>{
 const writes=await audit(page,false);
 await expect(page.locator('#seo-check-results .seo-check-item').first()).toBeVisible();
 await expect(page.getByRole('group',{name:'Filter checks'}).locator('button[aria-pressed="true"]')).toHaveCount(1);
 await expect(page.getByText('Choose a status to explore',{exact:true})).toHaveCount(0);
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.dataset.folioTheme=theme;},theme);
  for(const width of info.project.name==='mobile'?[320,393]:[900,1440]){
   await page.setViewportSize({width,height:1000});
   await expect(page.locator('.seo-summary')).toBeVisible();
   const layout=await page.evaluate(()=>{const card=document.querySelector('.seo-summary')!,button=card.querySelector('button')!,a=card.getBoundingClientRect(),b=button.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,contained:b.left>=a.left&&b.right<=a.right+1,arc:getComputedStyle(card.querySelector('.score-ring')!).backgroundImage};});
   expect(layout.overflow,`${theme} ${width}px`).toBe(false);expect(layout.contained).toBe(true);expect(layout.arc).toBe('none');
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
   const bottom=await page.evaluate(()=>({bodyPadding:getComputedStyle(document.body).paddingBottom,shellBottom:document.querySelector('.app-shell')!.getBoundingClientRect().bottom,viewport:innerHeight,contentPadding:parseFloat(getComputedStyle(document.querySelector('.page-content')!).paddingBottom)}));
   expect(bottom.bodyPadding,`${theme} ${width}px must not expose document padding below the shell`).toBe('0px');
   expect(bottom.shellBottom).toBeGreaterThanOrEqual(bottom.viewport-1);
   expect(bottom.contentPadding).toBeGreaterThanOrEqual(76);
  }
 }
 expect(writes).toEqual([]);
});
