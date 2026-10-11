// G1 golden master: the original root /index.html (oracle) and the apps/free build are driven through the
// same UI script with the same seeded Math.random and constant Date.now. Everything the user can read
// (nav + Matches + Board + Finals text) and the persisted state must be identical.
//
// MATRIX RUN: N in {4,5,6,8,9,12}; for each N, EVERY valid m (N*m%4==0, m<=N-1):
//   N=4:{1,2,3}  N=5:{4}  N=6:{2,4}  N=8:{1..7}  N=9:{4,8}  N=12:{1..11}  => 26 (N,m) pairs.
// FULL cross product with points-to-play {7,11,15,21} x mode {side,rally} would be 26*8 = 208 scenarios.
// FULL=1 (env) runs all 208. Default (rotating pairing) runs, for every (N,m) pair, all 4 values of `to`
// (mode rotates with (pairIndex + toIndex) % 2) = 104 scenarios, plus the dedicated tie scenarios below.
// Every (N,m) is covered with every `to` and both modes appear for every `to`; every N sees both modes.
import { expect, test, type Browser } from '@playwright/test';
import {
  NAMES, both, scriptedScore, saveScore, setup, startRootServer, tab, validM, views, saved,
  type Env, type Mode, type Scn, type Side,
} from './harness';
import type { Page } from '@playwright/test';

const FULL = process.env.FULL === '1';
const NS = [4, 5, 6, 8, 9, 12];
const TOS = [7, 11, 15, 21];
const MODES: Mode[] = ['side', 'rally'];
const POOL = 4;

let env: Env;
let closeRoot: () => Promise<void>;
test.beforeAll(async () => {
  const r = await startRootServer();
  closeRoot = r.close;
  env = { oldBase: r.base, newBase: process.env.NEW_BASE_OVERRIDE ?? process.env.PREVIEW_BASE_URL! };
});
test.afterAll(async () => { await closeRoot?.(); });

function scenarios(): Scn[] {
  const out: Scn[] = [];
  let pair = 0;
  for (const n of NS) for (const m of validM(n)) {
    TOS.forEach((to, ti) => {
      for (const mode of MODES) {
        if (!FULL && MODES.indexOf(mode) !== (pair + ti) % 2) continue;
        out.push({ n, m, to, mode, seed: 1000 + out.length * 7919, idx: out.length });
      }
    });
    pair++;
  }
  return out;
}
const ALL = scenarios();
console.log(`G1 scenarios: ${ALL.length} (+ dedicated tie scenarios), FULL=${FULL ? 1 : 0}`);

interface Trace {
  rejected: string[]; midMatches: string; midBoard: string; midBoardAt: string;
  matches: string; board: string; finalsPre: string; tieNote: boolean; swapped: string[];
  finalsStarted: string; finalBad: string; champion: string; boardAfter: string; state: unknown;
}

async function swapStates(page: Page): Promise<{ tie: boolean; texts: string[] }> {
  const swap = page.locator('button[data-act="tieSwap"]');
  if ((await swap.count()) === 0) return { tie: false, texts: [] };
  const texts: string[] = [await views(page)];
  await swap.click(); texts.push(await views(page));
  await page.locator('button[data-act="tieSwap"]').click(); texts.push(await views(page));
  return { tie: true, texts };
}

/** The UI script. `scores` overrides scriptedScore (used by the dedicated tie scenarios). */
async function drive(page: Page, s: Scn, scores?: Array<[number, number]>, keepSwapped = false): Promise<Trace> {
  const total = (s.n * s.m) / 4;
  const sc = (i: number) => (scores ? scores[i] : scriptedScore(i, s.to, s.idx));
  await setup(page, s);
  await tab(page, 'matches');
  // win-by-2 rejections must read the same (and be shown) in both apps
  const rejected: string[] = [];
  const T = s.to;
  for (const [a, b] of [[T, T], [T - 1, 0], [T, T - 1], [T + 1, T], [T + 5, T - 1], [0, 0]]) {
    await saveScore(page, 'm0', a, b);
    const e = page.locator('#m0err');
    rejected.push(`${a}-${b}|${await e.isVisible()}|${await e.textContent()}`);
    expect(await e.isVisible(), `${a}-${b} must be rejected for to=${T}`).toBe(true);
  }
  const half = Math.floor(total / 2);
  for (let i = 0; i < half; i++) { const [a, b] = sc(i); await saveScore(page, `m${i}`, a, b); }
  const midMatches = await views(page);
  await tab(page, 'board');
  const midBoard = await views(page);
  let midBoardAt = '';
  if (half >= 1) { await page.selectOption('#lbAt', String(Math.max(1, half - 1))); midBoardAt = await views(page); await page.selectOption('#lbAt', '0'); }
  await tab(page, 'matches');
  for (let i = half; i < total; i++) { const [a, b] = sc(i); await saveScore(page, `m${i}`, a, b); }
  const matches = await views(page);
  await tab(page, 'board'); const board = await views(page);
  await tab(page, 'finals'); const finalsPre = await views(page);
  const sw = await swapStates(page);
  if (sw.tie && keepSwapped) await page.locator('button[data-act="tieSwap"]').click();
  await page.click('button[data-act="startFinals"]');
  const finalsStarted = await views(page);
  await saveScore(page, 'f', T - 1, T - 1);
  const finalBad = `${await page.locator('#ferr').isVisible()}|${await page.locator('#ferr').textContent()}`;
  expect(await page.locator('#ferr').isVisible()).toBe(true);
  const [fa, fb] = s.idx % 2 ? [T + 2, T] : [T, 1];
  await saveScore(page, 'f', fa, fb);
  await page.waitForSelector('.champ');
  const champion = await views(page);
  await tab(page, 'board'); const boardAfter = await views(page);
  const key = await page.evaluate(() => Object.keys(localStorage)[0]);
  return { rejected, midMatches, midBoard, midBoardAt, matches, board, finalsPre, tieNote: sw.tie, swapped: sw.texts,
    finalsStarted, finalBad, champion, boardAfter, state: await saved(page, key) };
}

function sameTrace(o: Trace, n: Trace): string[] {
  const bad: string[] = [];
  for (const k of Object.keys(o) as Array<keyof Trace>) {
    try { expect(n[k], String(k)).toEqual(o[k]); } catch (e) { bad.push(`${k}: ${(e as Error).message.split('\n').slice(0, 12).join(' / ').slice(0, 600)}`); }
  }
  return bad;
}

async function runScenario(browser: Browser, s: Scn, scores?: Array<[number, number]>, keepSwapped = false) {
  const { o, n } = await both(browser, env, s.seed, (page, _side: Side) => drive(page, s, scores, keepSwapped));
  return { o, n, diffs: sameTrace(o, n) };
}

async function pool<T>(items: T[], fn: (t: T) => Promise<string | null>): Promise<string[]> {
  const fails: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (next < items.length) {
      const t = items[next++];
      try { const r = await fn(t); if (r) fails.push(r); } catch (e) { fails.push(`${JSON.stringify(t)} threw: ${(e as Error).message.slice(0, 400)}`); }
    }
  }));
  return fails;
}

for (const n of NS) {
  test(`golden master N=${n}: old === new for every valid m x to x mode`, async ({ browser }) => {
    test.setTimeout(30 * 60_000);
    const mine = ALL.filter((s) => s.n === n);
    const fails = await pool(mine, async (s) => {
      const r = await runScenario(browser, s);
      return r.diffs.length ? `N=${s.n} m=${s.m} to=${s.to} ${s.mode} seed=${s.seed}: ${r.diffs.join(' || ')}` : null;
    });
    expect(fails, fails.join('\n')).toEqual([]);
  });
}

// ---- dedicated tie scenarios ----
// Standings per the rules: win +3, loss -1 per player; order pts, wins, diff, pf, then name.
type M4 = { t1: number[]; t2: number[] };
function rank(names: string[], ms: M4[], sc: Array<[number, number]>) {
  const r = names.map((name) => ({ name, w: 0, pts: 0, diff: 0, pf: 0 }));
  ms.forEach((m, i) => {
    const [a, b] = sc[i]; const w1 = a > b; const d = Math.abs(a - b);
    m.t1.forEach((p) => { r[p].pts += w1 ? 3 : -1; r[p].w += w1 ? 1 : 0; r[p].diff += w1 ? d : -d; r[p].pf += a; });
    m.t2.forEach((p) => { r[p].pts += w1 ? -1 : 3; r[p].w += w1 ? 0 : 1; r[p].diff += w1 ? -d : d; r[p].pf += b; });
  });
  return r.sort((x, y) => y.pts - x.pts || y.w - x.w || y.diff - x.diff || y.pf - x.pf || x.name.localeCompare(y.name));
}
const lvl = (a: any, b: any) => a.pts === b.pts && a.w === b.w && a.diff === b.diff && a.pf === b.pf;
function mulberry(a: number) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Search valid scores (to=11) for a schedule so that 4th and 5th are level (and optionally 6th too). */
function findTieScores(names: string[], ms: M4[], to: number, threeWay: boolean): Array<[number, number]> | null {
  const rnd = mulberry(12345);
  const opts: Array<[number, number]> = [];
  for (let lo = 0; lo <= to - 2; lo++) opts.push([to, lo]);
  opts.push([to + 1, to - 1], [to + 2, to]);
  for (let tries = 0; tries < 400000; tries++) {
    const sc = ms.map(() => { const [h, l] = opts[Math.floor(rnd() * opts.length)]; return (rnd() < 0.5 ? [h, l] : [l, h]) as [number, number]; });
    const r = rank(names, ms, sc);
    if (!lvl(r[3], r[4])) continue;
    if (threeWay && !(r.length > 5 && lvl(r[4], r[5]))) continue;
    if (!threeWay && r.length > 5 && lvl(r[4], r[5])) continue;
    if (r.length > 3 && lvl(r[2], r[3])) continue; // keep 3rd distinct so only the 4th/5th boundary is in play
    return sc;
  }
  return null;
}

async function dedicatedTie(browser: Browser, n: number, m: number, threeWay: boolean) {
  const base: Scn = { n, m, to: 11, mode: 'side', seed: 4242, idx: 0 };
  const names = NAMES.slice(0, n);
  // Read the schedule the oracle generates for this seed (via the app's own saved state).
  const { ctx, page } = await (await import('./harness')).openPage(browser, env.oldBase, base.seed);
  await setup(page, base);
  const st: any = await saved(page, 'pickleball_tournament_v1');
  await ctx.close();
  const ms: M4[] = st.matches;
  const sc = findTieScores(names, ms, base.to, threeWay);
  expect(sc, `no tie scores found for N=${n} m=${m} threeWay=${threeWay}`).not.toBeNull();
  const results: Array<{ keep: boolean; trace: { o: Trace; n: Trace }; diffs: string[] }> = [];
  for (const keep of [false, true]) {
    const r = await runScenario(browser, base, sc!, keep);
    results.push({ keep, trace: { o: r.o, n: r.n }, diffs: r.diffs });
  }
  return { results, ranked: rank(names, ms, sc!) };
}

for (const [n, m, three] of [[5, 4, false], [6, 4, false], [6, 4, true], [8, 7, true]] as Array<[number, number, boolean]>) {
  test(`tie at 4th/5th cutoff, ${three ? '3-way for 4th' : '2-way'}, N=${n} m=${m}: tieSwap off and on`, async ({ browser }) => {
    test.setTimeout(10 * 60_000);
    const { results, ranked } = await dedicatedTie(browser, n, m, three);
    for (const r of results) {
      expect(r.diffs, `keepSwapped=${r.keep}: ${r.diffs.join(' || ')}`).toEqual([]);
      const o = r.trace.o;
      // the tie really occurred: the "level" notes and the swap button are shown
      expect(o.tieNote, 'swap button present (tie occurred)').toBe(true);
      expect(o.board).toContain('4th and 5th are level on every tiebreaker');
      expect(o.finalsPre).toMatch(/are level for 4th on points, wins, point difference and points scored/);
      // swap off -> on -> off toggles the finalist; texts differ between states
      expect(o.swapped[0]).not.toBe(o.swapped[1]);
      expect(o.swapped[0]).toBe(o.swapped[2]);
      expect(r.trace.n.swapped).toEqual(o.swapped);
    }
    // the swap decides who is in the final (state differs between keep=false and keep=true)
    const [off, on] = results;
    expect(JSON.stringify((off.trace.o.state as any).finals.teams)).not.toBe(JSON.stringify((on.trace.o.state as any).finals.teams));
    expect(JSON.stringify((off.trace.n.state as any).finals.teams)).toBe(JSON.stringify((off.trace.o.state as any).finals.teams));
    expect(JSON.stringify((on.trace.n.state as any).finals.teams)).toBe(JSON.stringify((on.trace.o.state as any).finals.teams));
    if (three) {
      // Preserved quirk: with a 3-way tie for 4th only the 5th (never the 6th) can be swapped in.
      const finalists = (s: any) => [...s.finals.teams.A, ...s.finals.teams.B] as string[];
      expect(finalists(on.trace.o.state), '6th never enters').not.toContain(ranked[5].name);
      expect(finalists(on.trace.o.state)).toContain(ranked[4].name);
      expect(finalists(off.trace.o.state)).toContain(ranked[3].name);
      expect(finalists(off.trace.o.state)).not.toContain(ranked[4].name);
    }
    console.log(`G1 tie scenario N=${n} m=${m} threeWay=${three}: ok`);
  });
}
