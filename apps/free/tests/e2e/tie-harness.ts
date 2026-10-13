// Shared helpers for the tie-rule specs (written from docs/specs/tie-rule.md and the UI contract, not from main.js).
import type { Browser, BrowserContext, Page } from '@playwright/test';

export const TOUR_KEY = 'pickleball_tournament_next_v1';
export const PREFS_KEY = 'pickleball_prefs_next_v1';
export const WIN2_RE = /win by 2|win-by-2|deuce/i;
export const HINT = 'Golden point is a house rule. Official USA Pickleball scoring is win by 2 (Rule 15.C).';
export const base = () => process.env.PREVIEW_BASE_URL!;

export interface Opened { ctx: BrowserContext; page: Page; errors: string[] }

/** Fresh 360px context. `storage` entries are injected only when absent (so reloads keep the app's own writes).
 *  `init` is an extra init script (string source). */
export async function openApp(browser: Browser, o: { storage?: Record<string, string>; init?: string } = {}): Promise<Opened> {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (o.init) await ctx.addInitScript(o.init);
  if (o.storage) {
    await ctx.addInitScript((e: Record<string, string>) => {
      try { for (const k of Object.keys(e)) if (localStorage.getItem(k) === null) localStorage.setItem(k, e[k]); } catch { /* ignore */ }
    }, o.storage);
  }
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav button');
  return { ctx, page, errors };
}

export const tieBtn = (page: Page, ns: 'cfg' | 'fcfg', v: 'golden' | 'win2') =>
  page.locator(`[data-ns="${ns}"] button[data-k="tie"][data-v="${v}"]`);
export async function isOn(page: Page, ns: 'cfg' | 'fcfg', v: 'golden' | 'win2'): Promise<boolean> {
  return ((await tieBtn(page, ns, v).getAttribute('class')) ?? '').split(/\s+/).includes('on');
}
export async function pickTie(page: Page, ns: 'cfg' | 'fcfg', v: 'golden' | 'win2'): Promise<void> {
  await tieBtn(page, ns, v).click();
}

export const NAMES5 = ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha'];

/** Generate a schedule. N players, m per player, play to `to`, optional tie rule chosen in the UI. */
export async function generate(page: Page, o: { n?: number; m?: number; to?: number; tie?: 'golden' | 'win2'; names?: string[] } = {}): Promise<void> {
  const n = o.n ?? 4;
  const names = o.names ?? ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha', 'Farah', 'Hana', 'Ivan'].slice(0, n);
  await page.click('#nav button[data-tab="setup"]');
  await page.fill('#players', names.join('\n'));
  if (o.to) await page.click(`[data-ns="cfg"] button[data-k="to"][data-v="${o.to}"]`);
  if (o.tie) await pickTie(page, 'cfg', o.tie);
  await page.selectOption('#mSel', String(o.m ?? 1));
  await page.click('button[data-act="generate"]');
  await page.waitForSelector('.mcard');
}

export async function tab(page: Page, t: 'setup' | 'matches' | 'board' | 'finals'): Promise<void> {
  await page.click(`#nav button[data-tab="${t}"]`);
}

export async function stored(page: Page, key = TOUR_KEY): Promise<any> {
  return page.evaluate((k) => { const r = localStorage.getItem(k); return r === null ? null : JSON.parse(r); }, key);
}
export async function storedRaw(page: Page, key = TOUR_KEY): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** Enter a score and press Save. Returns whether the UI rejected it (error visible) and the message. */
export async function enter(page: Page, id: string, a: number, b: number): Promise<{ rejected: boolean; msg: string }> {
  await page.fill(`#${id}a`, String(a));
  await page.fill(`#${id}b`, String(b));
  await page.click(`button[data-act="saveScore"][data-id="${id}"]`);
  const e = page.locator(`#${id}err`);
  const rejected = await e.isVisible();
  return { rejected, msg: rejected ? ((await e.textContent()) ?? '') : '' };
}

/** Does any object in the JSON have an own key exactly 'tie'? (tieSwap is a different key.) Returns paths. */
export function tiePaths(v: unknown, path = '$'): string[] {
  const out: string[] = [];
  if (Array.isArray(v)) v.forEach((x, i) => out.push(...tiePaths(x, `${path}[${i}]`)));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
    if (k === 'tie') out.push(`${path}.tie`);
    out.push(...tiePaths(x, `${path}.${k}`));
  }
  return out;
}

/** innerText of the whole body with every [data-tie-ui] element hidden (they exist only in the new app). */
export async function textNoTieUi(page: Page): Promise<string> {
  return page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '[data-tie-ui]{display:none!important}';
    document.head.appendChild(st);
    try { return document.body.innerText; } finally { st.remove(); }
  });
}
/** Attribute text a user/AT can see or hear (placeholder, aria-label, title, alt), outside [data-tie-ui]. */
export async function attrText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.closest('[data-tie-ui]')) continue;
      for (const a of ['placeholder', 'aria-label', 'title', 'alt']) { const v = el.getAttribute(a); if (v) out.push(v); }
    }
    return out.join('\n') + '\n' + document.title;
  });
}

/** Drive a 4-player, 1-match tournament to the unlocked final. Returns after the Finals tab is shown. */
export async function toFinalsTab(page: Page, o: { to?: number; tie: 'golden' | 'win2'; score?: [number, number] }): Promise<void> {
  const to = o.to ?? 11;
  await generate(page, { n: 4, m: 1, to, tie: o.tie });
  await tab(page, 'matches');
  const [a, b] = o.score ?? (o.tie === 'golden' ? [to, to - 1] : [to, 3]);
  const r = await enter(page, 'm0', a, b);
  if (r.rejected) throw new Error(`group score ${a}-${b} unexpectedly rejected: ${r.msg}`);
  await tab(page, 'finals');
}
