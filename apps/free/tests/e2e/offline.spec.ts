// G3 offline (goes green only after stage S5). Fresh browser context with no prior service worker.
// Rules: after the SW is active AND controlling the page, going offline and reloading still renders the app,
// a tournament can be set up (4+ players, generate) and a score entered; the built entry JS is in cache
// a net-picking-v<n> cache (n != 1, the old app's cache); and no cache net-picking-v1 (old app) or
// net-picking-next-* (retired preview) survives activation.
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

test('offline: SW controls the page, offline reload renders, tournament + score work, entry JS cached', async ({ browser }) => {
  const base = process.env.APP_BASE_URL!;
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();

  // Pre-seed the old app's cache and a retired preview cache on this origin without loading the app (no SW is
  // registered on this URL), so that "they are gone after activation" is a real check.
  await page.goto(new URL('manifest.webmanifest', base).href);
  await page.evaluate(async () => { await caches.open('net-picking-v1'); await caches.open('net-picking-next-v3'); });
  expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(['net-picking-v1', 'net-picking-next-v3']));

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav button');
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r && !!r.active && r.active.state === 'activated' && !!navigator.serviceWorker.controller;
  }, undefined, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);

  // caches after activation. caches.open creates the key before addAll finishes, so wait for the
  // real condition: entry JS and index.html both resolvable from the new versioned cache.
  const cacheName = () => page.evaluate(async () => (await caches.keys()).find((k) => /^net-picking-v(\d+)$/.test(k) && k !== 'net-picking-v1') ?? null);
  const entry = entrySrc();
  const entryUrl = new URL(entry, base).href;
  const indexUrl = new URL('index.html', base).href;
  await expect
    .poll(
      () =>
        page.evaluate(
          async ([e, i, root]) => {
            const name = (await caches.keys()).find((k) => /^net-picking-v(\d+)$/.test(k) && k !== 'net-picking-v1');
            if (!name) return false;
            const c = await caches.open(name);
            return !!(await c.match(e)) && (!!(await c.match(i)) || !!(await c.match(root)));
          },
          [entryUrl, indexUrl, base],
        ),
      { timeout: 30_000, message: 'precache of entry JS and index.html in the new net-picking-v<n> cache' },
    )
    .toBe(true);
  const keys = await page.evaluate(() => caches.keys());
  const name = await cacheName();
  expect(name, 'a net-picking-v<n> cache with n != 1').toMatch(/^net-picking-v\d+$/);
  expect(keys, 'old app cache removed after activation').not.toContain('net-picking-v1');
  expect(keys.filter((k) => k.startsWith('net-picking-next-')), 'retired preview caches removed').toEqual([]);
  const hit = await page.evaluate(async ([n, u]) => !!(await (await caches.open(n)).match(u)), [name!, entryUrl] as const);
  expect(hit, `entry JS ${entry} must be precached in ${name}`).toBe(true);

  // offline reload
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav button[data-tab="setup"]')).toBeVisible();
  await expect(page.getByText('PREVIEW')).toHaveCount(0);
  await expect(page).toHaveTitle('Net-picking');

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
