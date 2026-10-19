// 4d: the retired preview storage keys must have no effect. A value left under pickleball_tournament_next_v1 /
// pickleball_prefs_next_v1 is neither read nor migrated nor modified nor deleted (rule: someone with win2 as the
// remembered default on the preview sees golden again; their preview tournament is not imported).
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PREFS_KEY, TOUR_KEY, enter, generate, isOn, openApp, storedRaw, tab } from './tie-harness';

const OLD_TOUR = 'pickleball_tournament_next_v1';
const OLD_PREFS = 'pickleball_prefs_next_v1';
const DISTINCT = 'Zyzzyva-Preview-Player';

function plantedTournament(): string {
  const st = JSON.parse(readFileSync(resolve(import.meta.dirname, '../fixtures/mid.json'), 'utf8'));
  st.players = st.players.map((p: string, i: number) => (i === 0 ? DISTINCT : p));
  st.playersText = st.players.join('\n');
  st.cfg = { ...st.cfg, tie: 'win2' };
  st.rules = { ...st.rules, tie: 'win2' };
  st.tab = 'board';
  return JSON.stringify(st);
}
const PREFS = JSON.stringify({ tie: 'win2' });

test('values under the _next_ keys are ignored: fresh setup, golden default, keys untouched', async ({ browser }) => {
  const tour = plantedTournament();
  const { ctx, page, errors } = await openApp(browser, { storage: { [OLD_TOUR]: tour, [OLD_PREFS]: PREFS } });
  try {
    // fresh setup: no schedule, no players, the planted name is nowhere
    await expect(page.locator('#players')).toHaveValue('');
    await expect(page.locator('.mcard')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(DISTINCT);
    // new-tournament default is golden although the (ignored) prefs said win2
    await tab(page, 'setup');
    expect(await isOn(page, 'cfg', 'golden')).toBe(true);
    expect(await isOn(page, 'cfg', 'win2')).toBe(false);
    // nothing was written under the live keys just by opening the app; the old keys are byte-identical
    expect(await storedRaw(page, PREFS_KEY)).toBeNull();
    expect(await storedRaw(page, OLD_TOUR)).toBe(tour);
    expect(await storedRaw(page, OLD_PREFS)).toBe(PREFS);

    // play a little: still golden, writes only live keys, and the old keys stay byte-identical
    await generate(page, { n: 4, m: 1, to: 11 });
    await tab(page, 'matches');
    expect((await enter(page, 'm0', 11, 10)).rejected, 'golden: 11-10 is a valid score').toBe(false);
    const live = JSON.parse((await storedRaw(page, TOUR_KEY))!);
    expect(live.cfg.tie).toBe('golden');
    expect(JSON.stringify(live)).not.toContain(DISTINCT);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav button');
    expect(await storedRaw(page, OLD_TOUR)).toBe(tour);
    expect(await storedRaw(page, OLD_PREFS)).toBe(PREFS);
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

test('a live-key tournament wins over planted _next_ values; saving the default writes only the live prefs key', async ({ browser }) => {
  const tour = plantedTournament();
  const liveRaw = readFileSync(resolve(import.meta.dirname, '../fixtures/no-cfg-mid.json'), 'utf8');
  const { ctx, page } = await openApp(browser, { storage: { [OLD_TOUR]: tour, [OLD_PREFS]: PREFS, [TOUR_KEY]: liveRaw } });
  try {
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(DISTINCT);
    await tab(page, 'setup');
    expect(await page.locator('#players').inputValue()).toContain('Asha');
    await page.click('[data-ns="cfg"] button[data-k="tie"][data-v="win2"]');
    await page.click('button[data-act="makeDefault"]');
    expect(JSON.parse((await storedRaw(page, PREFS_KEY))!)).toEqual({ tie: 'win2' });
    expect(await storedRaw(page, OLD_PREFS)).toBe(PREFS);
    expect(await storedRaw(page, OLD_TOUR)).toBe(tour);
  } finally { await ctx.close(); }
});
