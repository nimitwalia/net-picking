// AGENTS.md rule 5: no network calls other than loading the page. Record EVERY request (page, subresource and
// service-worker issued) across first load, a full play-through, and an offline reload, and require them all to be
// same-origin. Nothing is stubbed: a third-party request must be seen, not silently blocked.
import { expect, test, type Request } from '@playwright/test';
import { enter, generate, tab } from './tie-harness';

const LOCAL = /^(data|blob|about):/;

test('every request across load, play and offline reload is same-origin', async ({ browser }) => {
  test.setTimeout(120_000);
  const base = process.env.APP_BASE_URL!;
  const origin = new URL(base).origin;
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
  const seen: Array<{ url: string; sw: boolean; phase: string }> = [];
  let phase = 'load';
  ctx.on('request', (r: Request) => { if (!LOCAL.test(r.url())) seen.push({ url: r.url(), sw: !!r.serviceWorker(), phase }); });
  const page = await ctx.newPage();
  try {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('#nav button');
    await page.waitForFunction(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return !!r && !!r.active && r.active.state === 'activated' && !!navigator.serviceWorker.controller;
    }, undefined, { timeout: 30_000 });
    await expect.poll(() => page.evaluate(async () => {
      let n = 0;
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/\.woff2(\?|$)/.test(r.url)) n++;
      return n;
    }), { timeout: 30_000, message: 'precache finished' }).toBeGreaterThanOrEqual(3);

    phase = 'play';
    await generate(page, { n: 4, m: 1, to: 11 });
    await tab(page, 'matches');
    expect((await enter(page, 'm0', 11, 4)).rejected).toBe(false);
    await tab(page, 'board');
    await tab(page, 'finals');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#nav button');

    phase = 'offline';
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav button');
    await tab(page, 'matches');
    await expect(page.locator('.mcard')).toHaveCount(1);
    await ctx.setOffline(false);

    expect(seen.length, 'requests were recorded').toBeGreaterThan(10);
    expect(seen.some((s) => /\.woff2(\?|$)/.test(s.url)), 'fonts are requested from the own origin').toBe(true);
    expect(seen.some((s) => /\/sw\.js(\?|$)/.test(s.url)), 'the service worker script request was seen').toBe(true);
    expect(seen.some((s) => s.phase === 'offline'), 'offline-phase requests were recorded').toBe(true);
    const foreign = seen.filter((s) => new URL(s.url).origin !== origin);
    expect(foreign, `third-party requests: ${JSON.stringify(foreign)}`).toEqual([]);
  } finally { await ctx.close(); }
});
