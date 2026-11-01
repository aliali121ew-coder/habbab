// Real-browser layout check at each required width, for every role's pages.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const WIDTHS = [[360, 740], [390, 844], [412, 915], [768, 1024]];
const PAGES = {
  admin: ['dashboard', 'subscribers', 'programs', 'general-aid', 'receipts', 'monthly-aid', 'closings', 'prescriptions', 'delegates', 'delegates/3', 'users', 'audit'],
  accountant: ['dashboard', 'general-aid', 'closings', 'delegates'],
  delegate1: ['dashboard', 'subscribers', 'receipts', 'me'],
  health: ['dashboard', 'prescriptions'],
};

const failures = [];
const report = (where, problem) => failures.push(`${where}: ${problem}`);

mkdirSync('tests/screens', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });

// Runs in the page: returns every layout rule that this view breaks.
const inspect = () => {
  const problems = [];
  const doc = document.documentElement;
  if (doc.dir !== 'rtl') problems.push('document is not RTL');
  if (doc.scrollWidth > doc.clientWidth) problems.push(`horizontal overflow ${doc.scrollWidth} > ${doc.clientWidth}`);
  const visible = (node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  for (const node of document.querySelectorAll('button, a.btn, .nav a, select, input, textarea')) {
    if (!visible(node)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.height < 44 && node.type !== 'file') problems.push(`tap target ${Math.round(rect.height)}px: ${node.textContent.trim().slice(0, 24) || node.tagName}`);
    if (rect.right > doc.clientWidth + 1 || rect.left < -1) problems.push(`off-screen: ${node.textContent.trim().slice(0, 24) || node.tagName}`);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName) && parseFloat(getComputedStyle(node).fontSize) < 16) {
      problems.push(`field font below 16px: ${node.tagName}`);
    }
  }
  return problems;
};

const waitLoaded = (page) => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 8000 });

// One login per role: the login rate limit is real, and this test should not trip it.
async function signIn(role) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE);
  await page.fill('input[autocomplete="username"]', role);
  await page.fill('input[type="password"]', 'Test-Pass-123');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.topbar');
  const state = await context.storageState();
  await context.close();
  return state;
}

for (const [width, height] of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: width < 768 });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForSelector('input[autocomplete="username"]');
  for (const problem of await page.evaluate(inspect)) report(`login@${width}`, problem);
  await page.screenshot({ path: `tests/screens/login-${width}.png` });
  await context.close();
}

for (const [role, paths] of Object.entries(PAGES)) {
  const storageState = await signIn(role);
  for (const [width, height] of WIDTHS) {
    const context = await browser.newContext({ storageState, viewport: { width, height }, hasTouch: true, isMobile: width < 768, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const scope = `${role}@${width}`;
    page.on('console', (message) => { if (message.type() === 'error') report(scope, `console: ${message.text()}`); });
    page.on('pageerror', (error) => report(scope, `exception: ${error.message}`));

    await page.goto(BASE);
    await page.waitForSelector('.topbar');

    for (const path of paths) {
      await page.goto(`${BASE}/#/${path}`);
      await page.waitForTimeout(150);
      await waitLoaded(page);
      for (const problem of await page.evaluate(inspect)) report(`${scope} ${path}`, problem);
      if (role === 'admin') await page.screenshot({ path: `tests/screens/${path.replace('/', '-')}-${width}.png` });
    }

    if (width < 768) {
      await page.click('.menu-btn');
      await page.waitForTimeout(280);
      const box = await page.locator('.drawer').boundingBox();
      if (box.x + box.width < width - 1) report(scope, 'drawer did not open from the right edge');
      for (const problem of await page.evaluate(inspect)) report(`${scope} drawer`, problem);
      if (role === 'admin') await page.screenshot({ path: `tests/screens/drawer-${width}.png` });
      await page.mouse.click(10, 300);
      await page.waitForTimeout(280);
      if (await page.locator('.drawer').evaluate((node) => node.classList.contains('open'))) report(scope, 'drawer did not close');
    }

    if (role === 'admin') {
      await page.goto(`${BASE}/#/subscribers`);
      await page.waitForSelector('.records tbody tr');
      const cardMode = await page.locator('.records thead').evaluate((node) => getComputedStyle(node).display === 'none');
      if ((width < 768) !== cardMode) report(scope, `expected ${width < 768 ? 'cards' : 'table'}`);

      await page.click('text=إضافة مشترك');
      await page.waitForSelector('dialog[open]');
      for (const problem of await page.evaluate(inspect)) report(`${scope} add sheet`, problem);
      await page.screenshot({ path: `tests/screens/sheet-${width}.png` });
      await page.click('[aria-label="إغلاق"]');

      await page.click('text=التفاصيل >> nth=0');
      await page.waitForSelector('dialog[open] .pairs');
      await waitLoaded(page);
      for (const problem of await page.evaluate(inspect)) report(`${scope} details sheet`, problem);
      await page.click('[aria-label="إغلاق"]');

      const before = await page.locator('.records tbody tr').count();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForFunction((count) => document.querySelectorAll('.records tbody tr').length > count, before, { timeout: 5000 })
        .catch(() => report(scope, 'infinite scroll did not load a second page'));
    }
    await context.close();
  }
}

// End to end on a phone: a large photo must be compressed in the browser, saved
// only on submit, and come back as a working thumbnail.
{
  const context = await browser.newContext({ storageState: await signIn('health'), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const uploads = [];
  page.on('request', (request) => { if (request.url().endsWith('/api/prescriptions') && request.method() === 'POST') uploads.push(request.postDataBuffer()?.length ?? 0); });
  page.on('pageerror', (error) => report('upload', `exception: ${error.message}`));
  await page.goto(`${BASE}/#/prescriptions`);
  await page.waitForSelector('.topbar');
  await page.click('text=إضافة وصفة');
  await page.waitForSelector('dialog[open]');

  const noisyPng = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const context2d = canvas.getContext('2d');
    const pixels = context2d.createImageData(3000, 2000);
    for (let i = 0; i < pixels.data.length; i++) pixels.data[i] = i % 4 === 3 ? 255 : Math.random() * 256;
    context2d.putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  });
  const original = Buffer.from(noisyPng, 'base64');

  await page.fill('dialog input[type="search"]', 'زينب');
  await page.click('dialog .picker li button >> nth=0');
  await page.locator('dialog label:has-text("التشخيص") input').fill('فحص الواجهة');
  await page.locator('dialog label:has-text("الأدوية") textarea').fill('دواء تجريبي');
  await page.setInputFiles('dialog input[type="file"]', { name: 'rx.png', mimeType: 'image/png', buffer: original });
  await page.waitForSelector('dialog .preview:not([hidden])', { timeout: 20000 });
  if (uploads.length) report('upload', 'image was sent before save');
  const hint = await page.locator('dialog .hint').innerText();
  const kb = Number(hint.match(/\d+/)?.[0]);
  console.log(`compressed ${Math.round(original.length / 1024)} KB -> ${kb} KB`);
  if (!(kb <= 300)) report('upload', `compressed size ${kb} KB`);
  await page.screenshot({ path: 'tests/screens/rx-form-390.png' });

  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.waitForFunction(() => {
    const image = document.querySelector('.records img.thumb');
    return image && image.complete && image.naturalWidth > 0;
  }, null, { timeout: 8000 }).catch(() => report('upload', 'thumbnail did not render'));
  await page.screenshot({ path: 'tests/screens/rx-list-390.png' });
  if (uploads.length !== 1) report('upload', `expected one upload, saw ${uploads.length}`);
  await context.close();
}

await browser.close();
if (failures.length) {
  console.log([...new Set(failures)].join('\n'));
  console.log(`\nFAILED: ${new Set(failures).size} problems`);
  process.exit(1);
}
console.log('PASSED: all pages at 360, 390, 412, 768');
