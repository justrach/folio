import {test,expect} from '@playwright/test';
test('website index compares websites and filters saved answers without spending',async({page})=>{
 const writes:string[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>{if(r.request().method()!=='GET')writes.push(r.request().url());return r.fulfill({json:null})});
 await page.goto('/leaderboard');
 const chart=page.getByRole('region',{name:'Which websites get recommended?'});
 await expect(chart).toBeVisible();await expect(chart.getByRole('img')).toBeVisible();
 await expect(chart).not.toContainText('token cost');
 await chart.getByLabel('Website comparison model').selectOption('gpt-6-astra');
 await expect(page).toHaveURL(/model=gpt-6-astra/);
 await expect(chart.getByRole('table')).toContainText('Railway');
 await chart.getByText('How to read this comparison',{exact:true}).click();
 await expect(chart).toContainText('Missing and failed answers are excluded');
 await page.goBack();await expect(chart.getByLabel('Website comparison model')).toHaveValue('');
 const widths=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);expect(widths[0]).toBeLessThanOrEqual(widths[1]+1);expect(writes).toEqual([]);expect(errors).toEqual([]);
});
