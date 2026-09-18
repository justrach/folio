import {test,expect} from '@playwright/test';
test('model landscape is readable, keyboard usable and filters the index without paid actions',async({page},info)=>{
 const writes:string[]=[], errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.route('**/api/**',r=>{if(r.request().method()!=='GET')writes.push(r.request().url());return r.fulfill({json:null})});
 await page.goto('/leaderboard');
 const chart=page.getByRole('region',{name:'The cost of an answer.'});
 await expect(chart).toBeVisible();
 await expect(chart.getByRole('img',{name:'Observed research time versus estimated token cost'}).filter({visible:true})).toBeVisible();
 const luna=chart.getByRole('link').filter({hasText:'Luna'});
 await luna.focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/model=gpt-5.6-luna/);
 await expect(page.getByRole('combobox',{name:'Index model'})).toHaveValue('gpt-5.6-luna');
 await expect(luna).toHaveAttribute('aria-current','true');
 await chart.getByText('Read the numbers & methodology',{exact:true}).click();
 await expect(chart.getByRole('table').filter({visible:true})).toBeVisible();
 await expect(chart).toContainText('Missing costs remain unknown');
 await chart.getByText('Inspect all 40 attempts',{exact:true}).click();
 await expect(chart.locator('.landscape-attempts tbody tr')).toHaveCount(40);
 await chart.getByText('Inspect all 40 attempts',{exact:true}).click();
 await page.goBack();await expect(page.getByRole('combobox',{name:'Index model'})).toHaveValue('');
 const widths=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);
 expect(widths[0]).toBeLessThanOrEqual(widths[1]+1);expect(writes).toEqual([]);expect(errors).toEqual([]);
 if(process.env.FOLIO_LANDSCAPE_SCREENSHOT){await chart.getByText('Read the numbers & methodology',{exact:true}).click();await chart.screenshot({path:`${process.env.FOLIO_LANDSCAPE_SCREENSHOT}-${info.project.name}.png`});}
});
