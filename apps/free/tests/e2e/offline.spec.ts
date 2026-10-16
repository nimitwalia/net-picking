// G3 offline (goes green only after stage S5). Fresh browser context with no prior service worker.
// Rules: after the SW is active AND controlling the page, going offline and reloading still renders the app,
// a tournament can be set up (4+ players, generate) and a score entered; the built entry JS is in cache
// net-picking-next-v3; and no cache net-picking-next-v1 survives activation.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../../dist');

function entrySrc(): string {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const m = html.match(/<script[^>]*type="module"[^>]*\ssrc="([^"]+)"/) ?? html.match(/<script[^>]*\ssrc="([^"]+)"[^>]*type="module"/);
  if (!m) throw new Error('dist/index.html has no module script (found by reading the built file, not hard-coded)');
  return m[1];
}

test('offline: SW controls the page, offline reload renders, tournament + score work, entry JS cached in v2', async ({ browser }) => {
  const base = process.env.PREVIEW_BASE_URL!;
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();

  // Pre-seed an old own cache on this origin without loading the app (no SW is registered on this URL),
  // so that "no net-picking-next-v1 remains after activation" is a real check.
  await page.goto(new URL('manifest.webmanifest', base).href);
  await page.evaluate(async () => { await caches.open('net-picking-next-v1'); });
  expect(await page.evaluate(() => caches.keys())).toContain('net-picking-next-v1');

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav button');
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r && !!r.active && r.active.state === 'activated' && !!navigator.serviceWorker.controller;
  }, undefined, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);

  // caches after activation. caches.open creates the key before addAll finishes, so wait for the
  // real condition: entry JS and index.html both resolvable from net-picking-next-v3.
  const entry = entrySrc();
  const entryUrl = new URL(entry, base).href;
  const indexUrl = new URL('index.html', base).href;
  await expect
    .poll(
      () =>
        page.evaluate(
          async ([e, i, root]) => {
            if (!(await caches.keys()).includes('net-picking-next-v3')) return false;
            const c = await caches.open('net-picking-next-v3');
            return !!(await c.match(e)) && (!!(await c.match(i)) || !!(await c.match(root)));
          },
          [entryUrl, indexUrl, base],
        ),
      { timeout: 30_000, message: 'precache of entry JS and index.html in net-picking-next-v3' },
    )
    .toBe(true);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).toContain('net-picking-next-v3');
  expect(keys, 'no net-picking-next-v1 after activation').not.toContain('net-picking-next-v1');
  const hit = await page.evaluate(async (u) => !!(await (await caches.open('net-picking-next-v3')).match(u)), entryUrl);
  expect(hit, `entry JS ${entry} must be precached in net-picking-next-v3`).toBe(true);

  // offline reload
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav button[data-tab="setup"]')).toBeVisible();
  await expect(page.getByText('PREVIEW', { exact: true })).toBeVisible();

  // set up a tournament and enter a score, entirely offline
  await page.fill('#players', ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha'].join('\n'));
  await page.selectOption('#mSel', '4');
  await page.click('button[data-act="generate"]');
  await expect(page.locator('.mcard')).toHaveCount(5);
  await page.fill('#m0a', '11');
  await page.fill('#m0b', '5');
  await page.click('button[data-act="saveScore"][data-id="m0"]');
  await expect(page.locator('.mcard').first().locator('.pill')).toHaveText('Saved');
  await ctx.close();
});
