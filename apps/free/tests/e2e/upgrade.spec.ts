// 4d UPGRADE: a browser that has the OLD app installed (old sw.js, cache net-picking-v1, a tournament saved under
// pickleball_tournament_v1) must pick up the new build served at the SAME origin and URL, keep its tournament,
// stay playable, and work offline. Rules (from docs/ROADMAP.md 4d and the cutover brief, not from the code):
//  - the new worker replaces the old one; net-picking-v1 and net-picking-next-* caches are deleted;
//  - caches this app does not own (e.g. other-app-v1) survive;
//  - the new cache net-picking-v<n> (n != 1) holds index.html and the main asset;
//  - the title is "Net-picking", no PREVIEW text, manifest name "Net-picking";
//  - the saved tournament is unchanged (players, matches, scores) and standings follow +3 win / -1 loss.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { saveScore, saved, setup, tab, views } from './harness';
import { DIST_DIR, LEGACY_DIR, startSwitchableServer, type SwitchableServer } from './switchable-server';

const KEY = 'pickleball_tournament_v1';

function entrySrc(): string {
  const html = readFileSync(resolve(DIST_DIR, 'index.html'), 'utf8');
  const m = html.match(/<script[^>]*type="module"[^>]*\ssrc="([^"]+)"/) ?? html.match(/<script[^>]*\ssrc="([^"]+)"[^>]*type="module"/);
  if (!m) throw new Error('dist/index.html has no module script');
  return m[1];
}

let server: SwitchableServer;
test.beforeAll(async () => { server = await startSwitchableServer('legacy'); });
test.afterAll(async () => { await server?.close(); });

interface Match { t1: number[]; t2: number[]; winner: number | null; s1?: number; s2?: number }
interface State { players: string[]; matches: Match[] }

/** Expected points per player from the saved matches: win +3, loss -1 (AGENTS.md, per player). */
function expectedPoints(st: State): Record<string, number> {
  const pts: Record<string, number> = Object.fromEntries(st.players.map((p) => [p, 0]));
  for (const m of st.matches) {
    if (!m.winner) continue;
    const win = m.winner === 1 ? m.t1 : m.t2;
    const lose = m.winner === 1 ? m.t2 : m.t1;
    for (const i of win) pts[st.players[i]] += 3;
    for (const i of lose) pts[st.players[i]] -= 1;
  }
  return pts;
}

/** Points per player as the Board table shows them. */
async function boardPoints(page: Page): Promise<Record<string, number>> {
  await tab(page, 'board');
  const rows = await page.$$eval('table tbody tr', (trs) =>
    trs.map((tr) => ({ name: (tr.querySelector('td.name') as HTMLElement).innerText.replace(/\s*[▲▼]\s*\d+\s*$/, '').trim(), pts: Number((tr.querySelector('td.pts') as HTMLElement).innerText.trim()) })));
  return Object.fromEntries(rows.map((r) => [r.name, r.pts]));
}

const ownCache = (keys: string[]) => keys.filter((k) => /^net-picking-v\d+$/.test(k) && k !== 'net-picking-v1');

async function swControlled(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r && !!r.active && r.active.state === 'activated' && !!navigator.serviceWorker.controller;
  });
}

async function freshPage(ctx: BrowserContext, url: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav button');
  return page;
}

test('upgrade: old installed app (v1 worker, v1 cache, saved tournament) -> new build at the same origin', async ({ browser }) => {
  test.setTimeout(180_000);
  const base = server.origin;
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // the old app links Google Fonts; no network in tests
  let page = await ctx.newPage();
  const errors: string[] = [];
  try {
    // ---- 1. OLD app: worker active and controlling, v1 cache exists
    server.use('legacy');
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav button');
    await expect(page).toHaveTitle('Net-picking');
    await expect.poll(() => swControlled(page), { timeout: 30_000, message: 'old SW active and controlling' }).toBe(true);
    await expect.poll(() => page.evaluate(async () => {
      if (!(await caches.keys()).includes('net-picking-v1')) return false;
      return (await (await caches.open('net-picking-v1')).keys()).length >= 6;
    }), { timeout: 30_000, message: 'old precache net-picking-v1 complete' }).toBe(true);
    const oldSwText = await page.evaluate(async () => (await fetch('sw.js')).text());
    expect(oldSwText, 'the legacy worker is the one being served').toBe(readFileSync(resolve(LEGACY_DIR, 'sw.js'), 'utf8'));

    // ---- 2. tournament made through the OLD app's UI; one score played
    await setup(page, { n: 5, m: 4, to: 11, mode: 'side', seed: 1, idx: 0 });
    await tab(page, 'matches');
    await saveScore(page, 'm0', 11, 5);
    await expect(page.locator('.mcard').first().locator('.pill')).toHaveText('Saved');
    const before = (await saved(page, KEY)) as State & Record<string, unknown>;
    expect(before.matches.length).toBe(5);
    expect(before.matches[0].winner).toBe(1);
    expect([before.matches[0].s1, before.matches[0].s2]).toEqual([11, 5]);
    const oldMatchesText = await (async () => { await tab(page, 'matches'); return views(page); })();
    const oldBoardText = await (async () => { await tab(page, 'board'); return views(page); })();
    expect(await boardPoints(page)).toEqual(expectedPoints(before));

    // other caches on this origin, created while the old worker is the active one
    await page.evaluate(async () => { await caches.open('other-app-v1'); await caches.open('net-picking-next-v3'); });
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(['net-picking-v1', 'other-app-v1', 'net-picking-next-v3']));

    // ---- 3. switch the server to the new build and trigger the update
    server.use('new');
    const newSwText = readFileSync(resolve(DIST_DIR, 'sw.js'), 'utf8');
    expect(newSwText).not.toBe(oldSwText);
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => /^net-picking-v\d+$/.test(k) && k !== 'net-picking-v1')),
      { timeout: 30_000, message: 'new worker installed (its net-picking-v<n> cache appears)' }).toBe(true);

    // Like a user coming back to the app: close the tab and open it again, repeating until the new worker
    // has taken over (it deletes net-picking-v1 when it activates). No fixed sleeps.
    page.on('pageerror', (e) => errors.push(String(e)));
    // The last observed state is kept so a timeout says what the worker and caches looked like (expect.poll's
    // message is a fixed string, so the failure is rethrown with the state attached).
    let last: unknown = 'poll callback never completed';
    try {
      await expect.poll(async () => {
        await page.close();
        page = await freshPage(ctx, base);
        page.on('pageerror', (e) => errors.push(String(e)));
        const st = await page.evaluate(async () => {
          const r = await navigator.serviceWorker.getRegistration();
          return { keys: await caches.keys(), active: r?.active?.state ?? null, waiting: !!r?.waiting, installing: !!r?.installing, controlled: !!navigator.serviceWorker.controller };
        });
        last = st;
        return !st.keys.includes('net-picking-v1') && ownCache(st.keys).length > 0 && st.active === 'activated' && !st.waiting && !st.installing && st.controlled;
      }, { timeout: 90_000, intervals: [500, 1000, 2000], message: 'new worker active and controlling, net-picking-v1 gone' }).toBe(true);
    } catch (cause) {
      throw new Error(
        `new worker active and controlling, net-picking-v1 gone: timed out.\nlast observed state: ${JSON.stringify(last)}\n` +
        `server request log (last 40 of ${server.log.length}): ${JSON.stringify(server.log.slice(-40))}`,
        { cause },
      );
    }
    // one more reload under the new worker, then everything below is the new app
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav button');

    // ---- 4. the new app is what loads
    await expect(page).toHaveTitle('Net-picking');
    await expect(page.getByText('PREVIEW')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.innerText)).not.toContain('Net-picking Next');
    await tab(page, 'setup');
    expect(await page.evaluate(() => !!document.querySelector('[data-tie-ui]')), 'this is the new app (has the tie-rule control)').toBe(true);
    await expect(page.locator('[data-ns="cfg"] button[data-k="tie"][data-v="win2"]'), 'old save shows win2').toHaveClass(/\bon\b/);
    const html = await page.evaluate(async () => (await fetch('index.html')).text());
    expect(html).toBe(readFileSync(resolve(DIST_DIR, 'index.html'), 'utf8'));

    // ---- 5. caches
    const keys = await page.evaluate(() => caches.keys());
    expect(keys, 'old app cache deleted').not.toContain('net-picking-v1');
    expect(keys.filter((k) => k.startsWith('net-picking-next-')), 'retired preview cache deleted').toEqual([]);
    expect(keys, 'foreign cache untouched').toContain('other-app-v1');
    const own = ownCache(keys);
    expect(own.length, `exactly one new net-picking-v<n> cache, got ${keys.join(',')}`).toBe(1);
    const entry = entrySrc();
    await expect.poll(() => page.evaluate(async ([name, e, b]) => {
      const c = await caches.open(name);
      return { index: !!(await c.match(new URL('index.html', b).href)) || !!(await c.match(b)), entry: !!(await c.match(new URL(e, b).href)) };
    }, [own[0], entry, base] as const), { timeout: 30_000, message: 'index.html and main asset are in the new cache' }).toEqual({ index: true, entry: true });

    // ---- 6. the manifest the upgraded page uses
    const mf = await page.evaluate(async () => {
      const href = (document.querySelector('link[rel="manifest"]') as HTMLLinkElement).href;
      const r = await fetch(href);
      return { href, status: r.status, json: await r.json() };
    });
    expect(mf.status).toBe(200);
    expect(mf.json.name).toBe('Net-picking');
    expect(mf.json.short_name).toBe('Net-picking');
    expect(mf.json).toEqual(JSON.parse(readFileSync(resolve(LEGACY_DIR, 'manifest.webmanifest'), 'utf8')));

    // ---- 7. the old tournament is still here, unchanged
    const after = (await saved(page, KEY)) as State & Record<string, unknown>;
    expect(after.players).toEqual(before.players);
    expect(after.matches).toEqual(before.matches);
    await tab(page, 'matches');
    await expect(page.locator('.mcard')).toHaveCount(5);
    await expect(page.locator('.mcard').first().locator('.pill')).toHaveText('Saved');
    expect(await views(page), 'Matches text is the same as in the old app').toBe(oldMatchesText);
    await tab(page, 'board');
    expect(await views(page), 'Board text is the same as in the old app').toBe(oldBoardText);
    expect(await boardPoints(page)).toEqual(expectedPoints(before));

    // ---- 8. still playable: another score updates the standings, and persists across a reload
    await tab(page, 'matches');
    await saveScore(page, 'm1', 9, 11); // win by 2 is the rule for this old save
    await expect(page.locator('#m1err')).toBeHidden();
    await expect(page.locator('.mcard').nth(1).locator('.pill')).toHaveText('Saved');
    const played = (await saved(page, KEY)) as State;
    expect(played.matches[1].winner).toBe(2);
    expect([played.matches[1].s1, played.matches[1].s2]).toEqual([9, 11]);
    const pts = expectedPoints(played);
    expect(await boardPoints(page)).toEqual(pts);
    expect(pts).not.toEqual(expectedPoints(before));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav button');
    expect(((await saved(page, KEY)) as State).matches[1].winner).toBe(2);
    expect(await boardPoints(page)).toEqual(pts);

    // ---- 9. offline: the app still loads with the tournament
    await expect.poll(() => swControlled(page)).toBe(true);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav button');
    await expect(page).toHaveTitle('Net-picking');
    await tab(page, 'matches');
    await expect(page.locator('.mcard')).toHaveCount(5);
    expect(await boardPoints(page)).toEqual(pts);
    await ctx.setOffline(false);

    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
});
