import {expect,test} from '@playwright/test';
import {publicIndexFixture} from './public-index-fixture';

test.beforeEach(async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/public/benchmarks'?publicIndexFixture:null}));
  await page.addInitScript(()=>{if(!localStorage.getItem('folio-dashboard-navigation'))localStorage.setItem('folio-dashboard-navigation','compact');});
});

test('sidebar and content resize together, reverse midway and preserve the chosen state',async({page},info)=>{
  test.skip(info.project.name==='mobile','Desktop rail resize; mobile uses its own drawer.');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/leaderboard');
  const toggle=page.getByRole('button',{name:'Compact navigation',exact:true});
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  const dimensions=()=>page.evaluate(()=>({side:document.querySelector('.sidebar')!.getBoundingClientRect().width,main:document.querySelector('.main-shell')!.getBoundingClientRect().left}));
  const initial=await dimensions();
  await toggle.focus();await page.keyboard.press('Space');
  await page.waitForTimeout(90);
  const middle=await dimensions();
  expect(middle.side).toBeGreaterThan(initial.side+5);
  expect(middle.side).toBeLessThan(224);
  expect(Math.abs(middle.side-middle.main)).toBeLessThan(2);
  // Keyboard activation also works while the control is moving.
  await page.keyboard.press('Space');
  await expect.poll(async()=>(await dimensions()).side).toBeCloseTo(initial.side,0);
  await page.keyboard.press('Space');
  await expect.poll(async()=>(await dimensions()).side).toBeCloseTo(224,0);
  await expect(page.getByRole('navigation',{name:'Public navigation'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.sidebar > .wordmark')).not.toBeVisible();
  await expect(toggle.locator('.folio-toggle-art[data-compact="false"]')).toBeVisible();
  expect(await toggle.evaluate(el=>Boolean(el.closest('.sidebar')))).toBe(true);
  const brand=await toggle.boundingBox();
  expect(brand!.x+brand!.width).toBeLessThanOrEqual((await dimensions()).main);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('data-nav-motion','true');
});

test('reduced motion applies navigation changes without a resize animation',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/leaderboard');
  if(info.project.name==='mobile'){
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    await expect(page.getByRole('navigation',{name:'Public navigation'})).toBeVisible();
    await expect(page.locator('.sidebar > .wordmark')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
    return;
  }
  await page.getByRole('button',{name:'Compact navigation',exact:true}).click();
  const state=await page.locator('.sidebar').evaluate(el=>({width:el.getBoundingClientRect().width,duration:getComputedStyle(el).transitionDuration}));
  expect(state.width).toBe(224);expect(state.duration).toBe('0s');
});

test('account footer keeps its two lines and height while navigation opens',async({page},info)=>{
  test.skip(info.project.name==='mobile','Mobile uses a drawer rather than the compact rail.');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/overview?view=demo');
  const profile=page.locator('.sidebar .profile');
  await expect(profile).toBeAttached();
  const before=await profile.evaluate(el=>({height:el.getBoundingClientRect().height,text:getComputedStyle(el.children[1]).whiteSpace}));
  await page.getByRole('button',{name:'Compact navigation',exact:true}).click();
  await page.waitForTimeout(120);
  const during=await profile.evaluate(el=>({height:el.getBoundingClientRect().height,text:getComputedStyle(el.children[1]).whiteSpace,small:getComputedStyle(el.querySelector('small')!).whiteSpace,display:getComputedStyle(el.children[1]).display}));
  expect(during.height).toBeCloseTo(before.height,0);
  expect(during.text).toBe('nowrap');expect(during.small).toBe('nowrap');expect(during.display).toBe('block');
  await expect.poll(()=>profile.locator('span').nth(1).evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
});
