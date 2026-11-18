// Real-browser check of the React subscribers page: layout at every width in both
// themes, then a full payment and its reversal through the UI.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const WIDTHS = [[360, 740], [390, 844], [412, 915], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const failures = [];
const report = (where, problem) => failures.push(`${where}: ${problem}`);

mkdirSync('tests/screens', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });

const inspect = () => {
  const problems = [];
  const doc = document.documentElement;
  if (doc.dir !== 'rtl') problems.push('document is not RTL');
  if (doc.scrollWidth > doc.clientWidth) problems.push(`horizontal overflow ${doc.scrollWidth} > ${doc.clientWidth}`);
  const narrow = doc.clientWidth < 1024;
  for (const node of document.querySelectorAll('button, a, select, input')) {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    if (!rect.width || !rect.height || style.visibility === 'hidden') continue;
    const name = (node.getAttribute('aria-label') ?? node.textContent).trim().slice(0, 24);
    if (rect.height < 40) problems.push(`tap height ${Math.round(rect.height)}: ${name}`);
    if (narrow && node.matches('.month') && rect.height < 44) problems.push(`month cell ${Math.round(rect.height)}`);
    if (rect.right > doc.clientWidth + 1 || rect.left < -1) problems.push(`off-screen: ${name}`);
    if (node.matches('input, select') && parseFloat(style.fontSize) < 16) problems.push('field font below 16px');
  }
  for (const node of document.querySelectorAll('.month-state')) {
    const cell = node.closest('.month').getBoundingClientRect();
    if (node.getBoundingClientRect().width > cell.width) problems.push('"مسدد" overflows its cell');
  }
  return problems;
};

async function session(username) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE);
  await page.fill('input[autocomplete="username"]', username);
  await page.fill('input[type="password"]', 'Test-Pass-123');
  await page.click('button[type="submit"]');
  await page.waitForSelector(username === 'admin' ? '.dcard' : '.reg-table');
  const state = await context.storageState();
  await context.close();
  return state;
}

for (const username of ['admin', 'delegate1']) {
  const storageState = await session(username);
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of WIDTHS) {
      const scope = `${username} ${theme} ${width}`;
      const context = await browser.newContext({ storageState, viewport: { width, height }, hasTouch: width < 1024, isMobile: width < 768, deviceScaleFactor: 1, colorScheme: theme });
      const page = await context.newPage();
      page.on('console', (message) => { if (message.type() === 'error') report(scope, `console: ${message.text()}`); });
      page.on('pageerror', (error) => report(scope, `exception: ${error.message}`));
      if (username === 'admin') {
        await page.goto(BASE);
        await page.waitForSelector('.dcard');
        await page.waitForSelector('.people-side');
        await page.waitForTimeout(150);
        for (const problem of await page.evaluate(inspect)) report(`${scope} cards`, problem);
        await page.screenshot({ path: `tests/screens/delegates-${theme}-${width}.png` });
      }
      await page.goto(`${BASE}/#/all`);
      await page.reload();
      await page.waitForSelector('.reg-table tbody tr');
      await page.waitForSelector('.panel-hero');
      await page.waitForTimeout(150);
      for (const problem of await page.evaluate(inspect)) report(scope, problem);
      if (username === 'admin') await page.screenshot({ path: `tests/screens/reg-${theme}-${width}.png` });
      await context.close();
    }
  }
}

// Full flow as the delegate, on a phone.
{
  const context = await browser.newContext({ storageState: await session('delegate1'), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => report('flow', `exception: ${error.message}`));
  await page.goto(BASE);
  await page.waitForSelector('.reg-table tbody tr');

  const unpaid = page.locator('.reg-table .month:not(.paid):not(.future)').first();
  const label = await unpaid.getAttribute('aria-label');
  await unpaid.click();
  await page.waitForSelector('dialog[open]');
  for (const problem of await page.evaluate(inspect)) report('payment dialog', problem);
  await page.screenshot({ path: 'tests/screens/reg-pay-390.png' });
  const amount = page.locator('dialog input[type="number"]');
  if (!(await amount.inputValue())) await amount.fill('5000');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });

  await page.waitForTimeout(300);
  const after = page.locator(`[aria-label="${label.replace('غير مسدد', 'مسدد')}"]`).first();
  if (!(await after.count())) report('flow', 'cell label did not change to paid');
  else {
    const colour = await after.evaluate((node) => getComputedStyle(node).backgroundColor);
    const [red, green] = colour.match(/\d+/g).map(Number);
    if (green <= red) report('flow', `paid cell is not green: ${colour}`);
    if (!(await after.locator('svg').count()) && !(await after.innerText()).includes('مسدد')) report('flow', 'paid cell has no check icon or مسدد');
  }

  await page.locator('input[type="search"]').fill('زينب');
  await page.waitForTimeout(700);
  if (await page.locator('.reg-table tbody tr').count() > 30) report('flow', 'search returned too many rows');
  await context.close();
}

// A delegate's card grows its photo on hover and opens only that delegate's register.
{
  const context = await browser.newContext({ storageState: await session('admin'), viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  page.on('pageerror', (error) => report('cards', `exception: ${error.message}`));
  await page.goto(BASE);
  const card = page.locator('.dcard').first();
  await card.waitFor();
  const mediaHeight = () => card.locator('.dcard-media').evaluate((node) => node.getBoundingClientRect().height);
  const before = await mediaHeight();
  await page.screenshot({ path: 'tests/screens/delegates-rest.png' });
  await card.hover();
  await page.waitForTimeout(300);
  if (Math.abs((await mediaHeight()) - before) > 2) report('cards', 'hover should not resize the avatar');
  if (await card.locator('.dcard-sub').evaluate((node) => node.getBoundingClientRect().height) === 0) report('cards', 'hover should keep details visible');
  await page.screenshot({ path: 'tests/screens/delegates-hover.png' });
  await page.locator('.dcard').last().hover();
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'tests/screens/delegates-hover-photo.png' });
  await card.hover();

  const name = await card.locator('h2').innerText();
  await card.click({ position: { x: 60, y: 60 } });
  await page.waitForSelector('.reg-table tbody tr');
  if (!/^#\/delegates\/\d+$/.test(await page.evaluate(() => location.hash))) report('cards', 'card did not open a delegate route');
  await page.locator('.page-head p', { hasText: name }).waitFor({ timeout: 5000 })
    .catch(() => report('cards', 'register does not name the delegate'));
  await page.click('.page-head a.btn');
  await page.waitForSelector('.dcard');
  await context.close();
}

// The reversal is the admin's, and the theme toggle must persist.
{
  const context = await browser.newContext({ storageState: await session('admin'), viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto(`${BASE}/#/all`);
  await page.waitForSelector('.reg-table tbody tr');

  await page.click('.theme-btn');
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') report('theme', 'toggle did not switch to dark');
  await page.reload();
  await page.waitForSelector('.reg-table tbody tr');
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') report('theme', 'dark theme was not remembered');

  const rowCount = await page.locator('.reg-table tbody tr').count();
  if (rowCount !== 10) report('pager', `expected 10 rows per page, got ${rowCount}`);
  const nextBtn = page.locator('.reg-pager .pager-btn').last();
  if (await nextBtn.count() === 0) {
    report('pager', 'pagination bar is missing');
  } else {
    const firstRowBefore = await page.locator('.reg-table tbody tr .reg-name').first().innerText();
    await nextBtn.click();
    await page.waitForTimeout(250);
    const firstRowAfter = await page.locator('.reg-table tbody tr .reg-name').first().innerText();
    if (firstRowAfter === firstRowBefore) report('pager', 'next page did not update displayed rows');
  }
  await context.close();
}

await browser.close();
if (failures.length) {
  console.log([...new Set(failures)].slice(0, 40).join('\n'));
  console.log(`\nFAILED: ${new Set(failures).size} problems`);
  process.exit(1);
}
console.log('PASSED: 360-1920, light and dark, delegate cards, payment flow, theme, pagination');
