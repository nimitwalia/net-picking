// Shared harness for the old-vs-new golden-master and saved-state specs.
// OLD = the legacy app fixture tests/fixtures/legacy/index.html (byte-exact copy of tag legacy-final; oracle).
// NEW = the apps/free build, which is now the live app. Both use storage key pickleball_tournament_v1 (they are
// always on different origins in these tests, so they do not share storage).
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';

export const OLD_KEY = 'pickleball_tournament_v1';
export const NEW_KEY = 'pickleball_tournament_v1';
export const legacyDir = resolve(import.meta.dirname, '../fixtures/legacy');

/** Serve the unmodified legacy fixture index.html (only that file) under /net-picking/. */
export async function startLegacyServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const html = readFileSync(resolve(legacyDir, 'index.html'));
  const server: Server = createServer((req, res) => {
    const p = new URL(req.url ?? '/', 'http://x').pathname;
    if (p === '/net-picking/' || p === '/net-picking/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html);
    } else res.writeHead(404).end('not found');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as { port: number }).port;
  return { base: `http://127.0.0.1:${port}/net-picking/`, close: () => new Promise<void>((ok) => server.close(() => ok())) };
}

export type Side = 'old' | 'new';
export interface Env { oldBase: string; newBase: string }

/** Fresh context (service workers blocked, fonts aborted) with seeded Math.random and constant Date.now. */
export async function openPage(browser: Browser, base: string, seed: number,
  before?: (ctx: BrowserContext) => Promise<void> | void, initScript?: { fn: (a: any) => void; arg: any }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((s: number) => {
    let a = s >>> 0;
    Math.random = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Date.now = () => 1700000000000;
  }, seed);
  if (initScript) await ctx.addInitScript(initScript.fn, initScript.arg);
  if (before) await before(ctx);
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav button');
  return { ctx, page };
}

export const NAMES = ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha', 'Farah', "O'Neil", 'Hana', 'Ivan', 'Jo & Co', 'Kai', 'Lena'];

export type Mode = 'side' | 'rally';
export interface Scn { n: number; m: number; to: number; mode: Mode; seed: number; idx: number; names?: string[] }

/** Valid matches-per-player from AGENTS.md: N*m % 4 === 0 and m <= N-1. */
export function validM(n: number): number[] {
  const out: number[] = [];
  for (let m = 1; m <= n - 1; m++) if ((n * m) % 4 === 0) out.push(m);
  return out;
}

/** A valid win-by-2 score for the chosen `to`, varying winner, margin and deuce length with the match index. */
export function scriptedScore(i: number, to: number, idx: number): [number, number] {
  const winnerA = (i + idx) % 3 !== 0;
  const kind = (i + idx) % 4;
  let hi: number, lo: number;
  if (kind === 0) { hi = to; lo = (i * 3 + idx) % (to - 1); }
  else if (kind === 1) { hi = to + 1; lo = to - 1; }
  else if (kind === 2) { hi = to + 2; lo = to; }
  else { const k = 1 + (i % 3); hi = to + 2 + k; lo = to + k; }
  return winnerA ? [hi, lo] : [lo, hi];
}

/** The new app defaults new tournaments to golden point; these old-behaviour tests need win by 2, so pick it
 *  explicitly. The old app has no such control, so this is a no-op there. */
export async function selectWin2(page: Page): Promise<void> {
  const b = page.locator('[data-ns="cfg"] button[data-k="tie"][data-v="win2"]');
  if ((await b.count()) > 0) await b.click();
}

export async function setup(page: Page, s: Scn): Promise<void> {
  const names = s.names ?? NAMES.slice(0, s.n);
  await page.fill('#players', names.join('\n'));
  await page.click(`[data-ns="cfg"] button[data-k="mode"][data-v="${s.mode}"]`);
  await page.click(`[data-ns="cfg"] button[data-k="to"][data-v="${s.to}"]`);
  await selectWin2(page);
  await page.selectOption('#mSel', String(s.m));
  await page.click('button[data-act="generate"]');
  await page.waitForFunction((t) => document.querySelectorAll('.mcard').length === t, (s.n * s.m) / 4);
}

export async function saveScore(page: Page, id: string, a: number, b: number): Promise<void> {
  await page.fill(`#${id}a`, String(a));
  await page.fill(`#${id}b`, String(b));
  await page.click(`button[data-act="saveScore"][data-id="${id}"]`);
}

export async function tab(page: Page, t: 'setup' | 'matches' | 'board' | 'finals'): Promise<void> {
  await page.click(`#nav button[data-tab="${t}"]`);
}

/** innerText of nav + view, as the user reads it. */
export async function views(page: Page): Promise<string> {
  // Elements marked data-tie-ui exist only in the new app (the tie-rule control and its hint); the old app has
  // none. Hide them while reading so the old-vs-new text comparison covers everything that existed before.
  return page.evaluate(() => {
    const st = document.createElement('style');
    // #rulesCard is the Rules card (docs/specs/rulebook-link.md), also new-app only and covered by rulebook-link.spec.ts.
    st.textContent = '[data-tie-ui],#rulesCard{display:none!important}';
    document.head.appendChild(st);
    try { return (document.getElementById('nav') as HTMLElement).innerText + '\n----\n' + (document.getElementById('view') as HTMLElement).innerText; }
    finally { st.remove(); }
  });
}

export async function saved(page: Page, key: string): Promise<unknown> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) as string), key);
}

/** Run the same async driver on old and new in parallel and return both results. */
export async function both<T>(browser: Browser, env: Env, seed: number, fn: (page: Page, side: Side, key: string) => Promise<T>): Promise<{ o: T; n: T }> {
  const run = async (side: Side) => {
    const { ctx, page } = await openPage(browser, side === 'old' ? env.oldBase : env.newBase, seed);
    try { return await fn(page, side, side === 'old' ? OLD_KEY : NEW_KEY); } finally { await ctx.close(); }
  };
  const [o, n] = await Promise.all([run('old'), run('new')]);
  return { o, n };
}
