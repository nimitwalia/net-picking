// 4d: every saved-state fixture, loaded under the LIVE key pickleball_tournament_v1, renders and plays as before.
// A save with no cfg/rules/fcfg/tie value reads as win2 (docs/specs/tie-rule.md). This file checks the rules
// directly (valid/invalid scores for win by 2); saved-state.spec.ts compares the new app with the old one.
import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOUR_KEY, enter, isOn, openApp, stored, tab, tiePaths } from './tie-harness';

const dir = resolve(import.meta.dirname, '../fixtures');
const FIXTURES = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

test('the fixture set covers the legacy finals shapes, no-cfg saves, mid and complete saves', () => {
  for (const f of ['legacy-seeds', 'legacy-sAsB', 'legacy-sAsB-unscored', 'no-cfg-mid', 'no-cfg-complete-legacy-finals', 'mid', 'complete-no-finals', 'complete-with-finals']) {
    expect(FIXTURES, f).toContain(`${f}.json`);
  }
});

for (const f of FIXTURES) {
  test(`live key: ${f} renders, every tab opens, and scoring follows win by 2`, async ({ browser }) => {
    test.setTimeout(120_000);
    const raw = readFileSync(resolve(dir, f), 'utf8');
    const src = JSON.parse(raw);
    const to: number = src.rules?.to ?? src.cfg?.to ?? 11;
    const { ctx, page, errors } = await openApp(browser, { storage: { [TOUR_KEY]: raw } });
    try {
      // renders: players and matches of the save are shown
      await tab(page, 'matches');
      await expect(page.locator('.mcard')).toHaveCount(src.matches.length);
      const text = await page.evaluate(() => document.body.innerText);
      for (const p of src.players as string[]) expect(text, `player ${p}`).toContain(p);
      for (const t of ['setup', 'matches', 'board', 'finals'] as const) {
        const b = page.locator(`#nav button[data-tab="${t}"]`);
        if (await b.isDisabled()) continue;
        await b.click();
        await expect(page.locator('#view')).not.toBeEmpty();
      }
      // a save without a tie value is win2 and stays without one
      expect(tiePaths(src)).toEqual([]);
      await tab(page, 'setup');
      expect(await isOn(page, 'cfg', 'win2')).toBe(true);

      // scoring: the original win-by-2 rules, for this save's points-to-play
      await tab(page, 'matches');
      const open = src.matches.findIndex((m: any) => !m.winner);
      const id = `m${open >= 0 ? open : 0}`;
      for (const [a, b, why] of [
        [to, to - 1, 'target reached by only one point (golden-only score)'],
        [to - 1, to, 'target reached by only one point, other side'],
        [to, to, 'a tie'],
        [to - 1, to - 3, 'nobody reached the target'],
        [to + 3, to, 'overtime must end exactly two ahead'],
      ] as Array<[number, number, string]>) {
        const r = await enter(page, id, a, b);
        expect(r.rejected, `${a}-${b} (${why}) must be rejected`).toBe(true);
      }
      // 12-10 for 11; generally (to+1)-(to-1): a valid deuce finish; and a plain win
      const r2 = await enter(page, id, to + 1, to - 1);
      expect(r2.rejected, `${to + 1}-${to - 1} is a valid win-by-2 finish`).toBe(false);
      if (await page.locator('#modal').isVisible()) await page.click('button[data-act="mYes"]');
      const st = await stored(page);
      const m = st.matches[open >= 0 ? open : 0];
      expect([m.s1, m.s2]).toEqual([to + 1, to - 1]);
      expect(m.winner).toBe(1);
      expect(tiePaths(st.matches), 'no tie value is written into matches').toEqual([]);
      // persists across a reload
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#nav button');
      const st2 = await stored(page);
      expect([st2.matches[open >= 0 ? open : 0].s1, st2.matches[open >= 0 ? open : 0].s2]).toEqual([to + 1, to - 1]);
      expect(errors).toEqual([]);
    } finally { await ctx.close(); }
  });
}
