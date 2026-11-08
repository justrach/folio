import {test,expect} from '@playwright/test';
for(const signedIn of [true,false])test(`pricing keeps retired provider-cost and credit-wallet surfaces removed (${signedIn?'signed in':'signed out'})`,async({page})=>{
 const reads:string[]=[],writes:string[]=[];
 await page.route('**/api/**',r=>{const req=r.request(),path=new URL(req.url()).pathname;reads.push(path);if(req.method()!=='GET')writes.push(path);return r.fulfill({json:path==='/api/auth/get-session'?(signedIn?{user:{id:'pricing-owner',name:'Fixture',email:'pricing@example.test'},session:{id:'fixture-session',userId:'pricing-owner',expiresAt:'2099-01-01T00:00:00Z'}}:null):{interest:null}});});
 await page.goto('/pricing');await expect(page.getByRole('heading',{name:'One index. Priced by seats.',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'What your runs cost'})).toHaveCount(0);
 expect(reads).not.toContain('/api/costs');expect(writes).toEqual([]);
 if(!signedIn)await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
