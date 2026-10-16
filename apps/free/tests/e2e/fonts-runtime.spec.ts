// Self-host fonts: runtime rules.
//  (a) no third-party request at all (page + service worker + context level) at 360x800
//  (b) first offline visit after one online load renders with the three families actually loaded
import { expect, test, type Page, type Request } from '@playwright/test';

const FAMILIES: Array<{ family: string; weight: number; sizes: number[] }> = [
  { family: 'Bricolage Grotesque', weight: 800, sizes: [12, 16, 48, 96] },
  { family: 'DM Sans', weight: 700, sizes: [12, 16, 48, 96] },
  { family: 'DM Mono', weight: 500, sizes: [12, 16, 48, 96] },
];

const isLocalScheme = (u: string) => /^(data|blob|about):/.test(u);

async function swReady(page: Page) {
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r && !!r.active && r.active.state === 'activated' && !!navigator.serviceWorker.controller;
  }, undefined, { timeout: 30_000 });
}

async function loadAll(page: Page) {
  await page.evaluate(async (fams) => {
    await document.fonts.ready;
    await Promise.all(fams.map((f) => document.fonts.load(`${f.weight} 16px "${f.family}"`, 'Aa0')));
    await document.fonts.ready;
  }, FAMILIES);
}

test('(a) no third-party requests on first load, 360x800', async ({ browser }) => {
  const base = process.env.APP_BASE_URL!;
  const origin = new URL(base).origin;
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
  const seen: string[] = [];
  const rec = (r: Request) => { if (!isLocalScheme(r.url())) seen.push(r.url()); };
  ctx.on('request', rec);
  const page = await ctx.newPage();
  page.on('request', rec);
  // Do NOT stub third parties: an actual request must be seen (and fail the test), not silently blocked.
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#nav button');
  await loadAll(page);
  await swReady(page);
  await page.waitForTimeout(1500); // let the SW precache and any late requests happen
  await page.reload({ waitUntil: 'load' });
  await loadAll(page);
  const foreign = seen.filter((u) => new URL(u).origin !== origin);
  expect(foreign, `third-party requests: ${foreign.join(', ')}`).toEqual([]);
  expect(seen.some((u) => /\.woff2(\?|$)/.test(u)), 'woff2 files were requested from own origin').toBe(true);
  await ctx.close();
});

test('(b) offline: fonts render from precache with all three families loaded', async ({ browser }) => {
  const base = process.env.APP_BASE_URL!;
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
  // Evidence: every failure with its error text and whether it was issued by the service worker (r.serviceWorker())
  // or by the page. Offline, the SW's own network-first fetch() fails (ERR_INTERNET_DISCONNECTED) and falls back
  // to the cache; that is expected and not a page-level failure. What the page experiences is asserted below.
  const swFailed: string[] = [];
  const pageFailed: string[] = [];
  const log: string[] = [];
  ctx.on('requestfailed', (r) => {
    const line = `${r.serviceWorker() ? 'SW' : 'PAGE'} ${r.url()} :: ${r.failure()?.errorText}`;
    log.push(line);
    (r.serviceWorker() ? swFailed : pageFailed).push(line);
  });
  const page = await ctx.newPage();
  const responses: Array<{ url: string; ok: boolean; status: number; fromSW: boolean; type: string }> = [];
  page.on('response', (res) => responses.push({
    url: res.url(), ok: res.ok(), status: res.status(), fromSW: res.fromServiceWorker(), type: res.request().resourceType(),
  }));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#nav button');
  await swReady(page);
  // precache complete: the own cache has at least one woff2 per family-ish (>=3 files)
  await expect.poll(() => page.evaluate(async () => {
    const names = (await caches.keys()).filter((k) => /^net-picking-v\d+$/.test(k));
    let n = 0;
    for (const k of names) for (const r of await (await caches.open(k)).keys()) if (/\.woff2(\?|$)/.test(r.url)) n++;
    return n;
  }), { timeout: 30_000, message: 'woff2 files precached' }).toBeGreaterThanOrEqual(3);
  log.length = 0; swFailed.length = 0; pageFailed.length = 0; responses.length = 0;

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav button');
  await loadAll(page);

  for (const f of FAMILIES) {
    for (const size of f.sizes) {
      const ok = await page.evaluate(([w, s, fam]) => document.fonts.check(`${w} ${s}px "${fam}"`), [f.weight, size, f.family] as const);
      expect(ok, `${f.weight} ${size}px ${f.family}`).toBe(true);
    }
  }
  // document.fonts.check is vacuously true when no face is declared, so also require declared, loaded faces.
  const faces = await page.evaluate(() =>
    [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), status: f.status, display: f.display })));
  for (const f of FAMILIES) {
    const mine = faces.filter((x) => x.family === f.family);
    expect(mine.length, `declared faces for ${f.family}`).toBeGreaterThan(0);
    expect(mine.some((x) => x.status === 'loaded'), `${f.family} has a loaded face`).toBe(true);
    expect(mine.filter((x) => x.status === 'error'), `${f.family} has no errored face`).toEqual([]);
    for (const x of mine) expect(x.display, `${f.family} font-display`).toBe('swap');
  }
  // the page really uses them for visible text
  expect(await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length)).toBeGreaterThanOrEqual(3);
  console.log('offline requestfailed log:\n' + log.join('\n'));
  // What the page experiences offline: every document/script/stylesheet/font response is OK and was answered by
  // the service worker (from its cache), and no page-initiated request failed unanswered.
  const main = responses.filter((r) => ['document', 'script', 'stylesheet', 'font'].includes(r.type));
  expect(main.filter((r) => r.type === 'document').length, 'document response seen').toBeGreaterThan(0);
  expect(main.filter((r) => r.type === 'font').length, 'font responses seen').toBeGreaterThanOrEqual(3);
  expect(main.filter((r) => !r.ok || !r.fromSW), `non-OK or non-SW responses: ${JSON.stringify(main)}`).toEqual([]);
  expect(pageFailed, 'page-level request failures (not answered by the SW)').toEqual([]);
  // Any SW-level failure must be the offline network error only (the SW then falls back to its cache).
  expect(swFailed.filter((l) => !/ERR_INTERNET_DISCONNECTED/.test(l)), 'unexpected SW failure reasons').toEqual([]);
  await ctx.close();
});
