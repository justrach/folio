import { expect, test, type Page } from '@playwright/test';

async function openDemo(page: Page) {
  const writes: string[] = [], reads: string[] = [], errors: string[] = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{
    const request=route.request(),path=new URL(request.url()).pathname;reads.push(path);
    if(request.method()!=='GET'){writes.push(path);return route.fulfill({status:409,json:{error:'No work permitted in the walkthrough fixture'}});}
    return route.fulfill({json:path==='/api/auth/get-session'?null:{configured:false,sites:[],reports:[],runs:[]}});
  });
  await page.goto('/overview?view=demo');
  await expect(page.getByRole('region',{name:'Interactive team walkthrough'})).toBeVisible();
  return {writes,reads,errors};
}
function noWork(state:Awaited<ReturnType<typeof openDemo>>){expect(state.writes).toEqual([]);expect(state.reads).not.toContain('/api/scans');expect(state.reads).not.toContain('/api/benchmarks/runs');expect(state.errors).toEqual([]);}

test('a teammate can turn a buyer question into a sourced, clearly labelled handoff',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  const state=await openDemo(page);
  await expect(page.getByRole('region',{name:'Sample data notice'})).toContainText('Fictional team & answers');
  await page.getByText('We’re a small team on a budget',{exact:true}).click();
  await page.getByRole('button',{name:'Show the example answer'}).click();
  await expect(page.getByRole('heading',{name:'Did we make the answer?'})).toBeFocused();
  await expect(page.getByText('Moss wasn’t named',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Willow Desk · Starter plan/}).click();
  await expect(page.getByRole('region',{name:'Example source excerpt'})).toContainText('five seats for $45');
  await page.getByRole('button',{name:'What should we do next?'}).click();
  await expect(page.getByLabel('Our follow-up')).toHaveValue(/Check whether our \$39 plan supports five teammates/);
  await page.getByLabel('Our follow-up').fill('Ask support to verify the seat allowance before suggesting a pricing-page edit.');
  await page.getByRole('button',{name:'Copy the team note'}).click();
  await expect(page.getByRole('heading',{name:'Note copied. Bring it to the team.'})).toBeVisible();
  const note=await page.evaluate(()=>navigator.clipboard.readText());
  expect(note).toContain('fictional sample data');expect(note).toContain('five-person support team');expect(note).toContain('Ask support to verify');expect(note).toContain('willow.example/plans');expect(note).toContain('not a live search result');
  await expect(page.getByRole('link',{name:'Try it with my website'})).toHaveAttribute('href','/start');
  await page.getByRole('button',{name:'Try another situation'}).click();
  await expect(page.getByRole('heading',{name:'Think like the person buying.'})).toBeFocused();
  noWork(state);
});

test('changing the buyer situation changes its answer, sources and follow-up',async({page})=>{
  const state=await openDemo(page);
  const radios=page.getByRole('radio');await radios.first().focus();await radios.first().press('ArrowRight');
  await expect(radios.nth(1)).toBeChecked();
  await expect(page.getByText('An operations lead replacing a shared Gmail account',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Show the example answer'}).click();
  await expect(page.getByText('Moss was named first',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Moss Inbox · Gmail import/}).click();
  await expect(page.getByRole('region',{name:'Example source excerpt'})).toContainText('Attachments and labels have separate import limits.');
  await page.getByRole('button',{name:'What should we do next?'}).click();
  await expect(page.getByLabel('Our follow-up')).toHaveValue(/Review our Gmail migration guide/);
  await page.getByLabel('Our follow-up').fill('Our edited migration note');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'What should we do next?'}).click();
  await expect(page.getByLabel('Our follow-up')).toHaveValue('Our edited migration note');
  await page.getByRole('button',{name:'Pick a buyer question'}).click();
  await page.getByText('Our team works across time zones',{exact:true}).click();
  await page.getByRole('button',{name:'Show the example answer'}).click();
  await expect(page.getByText('Moss was named second',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Example source excerpt'})).toHaveCount(0);
  await page.getByRole('button',{name:'What should we do next?'}).click();
  await expect(page.getByLabel('Our follow-up')).toHaveValue(/Ask support how they hand a conversation/);
  noWork(state);
});

test('clipboard denial preserves the note and never claims it was copied',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Clipboard denied in fixture');}}}));
  const state=await openDemo(page);
  await page.getByRole('button',{name:'Show the example answer'}).click();await page.getByRole('button',{name:'What should we do next?'}).click();
  await page.getByLabel('Our follow-up').fill('');await expect(page.getByRole('button',{name:'Copy the team note'})).toBeDisabled();
  await page.getByLabel('Our follow-up').fill('Keep our note available.');await page.getByRole('button',{name:'Copy the team note'}).click();
  await expect(page.getByRole('region',{name:'Interactive team walkthrough'}).getByRole('alert')).toContainText('copy it manually');await expect(page.getByLabel('Our follow-up')).toBeFocused();await expect(page.getByLabel('Our follow-up')).toHaveValue('Keep our note available.');
  await expect(page.getByRole('heading',{name:'Note copied. Bring it to the team.'})).toHaveCount(0);noWork(state);
});

test('a pending copy keeps the handoff intact until the clipboard confirms it',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise<void>(resolve=>{(window as Window & {finishDemoCopy?:()=>void}).finishDemoCopy=resolve;})}}));
  const state=await openDemo(page);
  await page.getByRole('button',{name:'Show the example answer'}).click();await page.getByRole('button',{name:'What should we do next?'}).click();
  await page.getByLabel('Our follow-up').fill('A note to copy once.');await page.getByRole('button',{name:'Copy the team note'}).click();
  await expect(page.getByRole('button',{name:'Copying…'})).toBeDisabled();await expect(page.getByLabel('Our follow-up')).toBeDisabled();await expect(page.getByRole('button',{name:'Back',exact:true})).toBeDisabled();
  await expect(page.getByRole('heading',{name:'Note copied. Bring it to the team.'})).toHaveCount(0);
  await page.evaluate(()=>(window as Window & {finishDemoCopy?:()=>void}).finishDemoCopy?.());
  await expect(page.getByRole('heading',{name:'Note copied. Bring it to the team.'})).toBeVisible();await expect(page.locator('.team-demo-finish blockquote')).toHaveText('A note to copy once.');noWork(state);
});

test('the walkthrough fits a narrow dark screen and honors reduced motion',async({page})=>{
  await page.setViewportSize({width:320,height:780});await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
  const state=await openDemo(page);
  await expect.poll(()=>page.locator('.team-demo-stage').evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
  for(const advance of ['Show the example answer','What should we do next?']){
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
    await page.getByRole('button',{name:advance}).click();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await expect(page.getByRole('link',{name:'Explore the sample charts'})).toHaveAttribute('href','/overview?view=demo&demo=charts');
  noWork(state);
});
