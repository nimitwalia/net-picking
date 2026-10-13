// T6: the golden-master specs drop everything marked data-tie-ui (the new tie-rule control exists only in the new
// app, so the old-vs-new text/DOM comparison has to ignore it). To make sure that normalisation cannot hide
// anything else, these tests pin EXACTLY which elements carry data-tie-ui in each view, and show that after dropping
// them the DOM equals the original app's DOM.
import { expect, test, type Page } from '@playwright/test';
import { HINT, tiePaths } from './tie-harness';
import { OLD_KEY, NEW_KEY, openPage, saveScore, saved, setup, startRootServer, tab, type Scn } from './harness';

const NORM = (h: string) => h.replace(/\s+/g, ' ').replace(/> </g, '><').trim();

async function tieUi(page: Page): Promise<{ count: number; tops: string[] }> {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-tie-ui]')];
    const tops = all.filter((e) => !e.parentElement!.closest('[data-tie-ui]')).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
    return { count: all.length, tops };
  });
}
async function viewHtmlWithoutTieUi(page: Page): Promise<string> {
  return page.evaluate(() => {
    const v = document.getElementById('view')!.cloneNode(true) as HTMLElement;
    v.querySelectorAll('[data-tie-ui]').forEach((e) => e.remove());
    return v.innerHTML;
  });
}

const SCN: Scn = { n: 5, m: 4, to: 11, mode: 'side', seed: 31, idx: 1 };
// Setup card: label, seg wrapper, 2 buttons, hint, default row, default button, default note = 8 elements, 4 top-level.
const SETUP_COUNT = 8;
const SETUP_TOPS = ['TIE AT MATCH POINT'.toLowerCase(), 'Golden point Win by 2 (deuce)', HINT, 'Make this my default Default for new tournaments: Golden point'];
// Final's card: label, seg wrapper, 2 buttons, hint = 5 elements, 3 top-level (no default button or note).
const FINAL_COUNT = 5;

test('exact data-tie-ui inventory per view (new app) and DOM equality with the old app after dropping them', async ({ browser }) => {
  test.setTimeout(120_000);
  const root = await startRootServer();
  try {
    const O = await openPage(browser, root.base, SCN.seed);
    const N = await openPage(browser, process.env.PREVIEW_BASE_URL!, SCN.seed);
    try {
      const dom: Record<string, [string, string]> = {};
      const grab = async (k: string) => { dom[k] = [NORM(await viewHtmlWithoutTieUi(O.page)), NORM(await viewHtmlWithoutTieUi(N.page))]; };

      // Setup, empty (new app starts golden: the old app's DOM is the win2 one, so select win2 first; the
      // tie-ui elements themselves are what changes with the selection).
      let u = await tieUi(O.page); expect(u).toEqual({ count: 0, tops: [] });
      u = await tieUi(N.page);
      expect(u.count, 'setup (empty)').toBe(SETUP_COUNT);
      expect(u.tops.map((t) => t.toLowerCase())).toEqual(SETUP_TOPS.map((t) => t.toLowerCase()));
      await N.page.click('[data-ns="cfg"] button[data-k="tie"][data-v="win2"]');
      await grab('setup-empty');

      await setup(O.page, SCN); await setup(N.page, SCN);
      await tab(O.page, 'setup'); await tab(N.page, 'setup');
      expect((await tieUi(N.page)).count, 'setup (schedule)').toBe(SETUP_COUNT);
      await grab('setup-schedule');
      for (const t of ['matches', 'board'] as const) {
        // board is disabled until a score exists
        if (t === 'board') { await tab(O.page, 'matches'); await tab(N.page, 'matches'); for (const p of [O.page, N.page]) await saveScore(p, 'm0', 11, 4); }
        await tab(O.page, t); await tab(N.page, t);
        expect(await tieUi(N.page), `${t} view has no tie-ui`).toEqual({ count: 0, tops: [] });
        await grab(t);
      }
      await tab(O.page, 'matches'); await tab(N.page, 'matches');
      for (let i = 1; i < 5; i++) for (const p of [O.page, N.page]) await saveScore(p, `m${i}`, i % 2 ? 11 : 13, i % 2 ? 6 : 11);
      await tab(O.page, 'finals'); await tab(N.page, 'finals');
      const fu = await tieUi(N.page);
      expect(fu.count, 'final pre-start card').toBe(FINAL_COUNT);
      expect(fu.tops.map((t) => t.toLowerCase())).toEqual(['tie at match point', 'golden point win by 2 (deuce)', HINT.toLowerCase()]);
      // the final's card starts from the group setting (win2 here), so no click needed
      await grab('final-prestart');
      await O.page.click('button[data-act="startFinals"]'); await N.page.click('button[data-act="startFinals"]');
      expect((await tieUi(N.page)).count, 'started final view').toBe(0);
      await grab('final-started');
      for (const p of [O.page, N.page]) await saveScore(p, 'f', 12, 10);
      expect((await tieUi(N.page)).count, 'champion view').toBe(0);
      await grab('final-champion');

      for (const [k, [o, n]] of Object.entries(dom)) expect(n, `DOM of ${k} after dropping data-tie-ui`).toBe(o);

      // stored state: tie only at the four documented places, all 'win2'
      const st: any = await saved(N.page, NEW_KEY);
      expect(tiePaths(st).sort()).toEqual(['$.cfg.tie', '$.fcfg.tie', '$.finals.rules.tie', '$.rules.tie']);
      expect([st.cfg.tie, st.rules.tie, st.fcfg.tie, st.finals.rules.tie]).toEqual(['win2', 'win2', 'win2', 'win2']);
      const stripped = JSON.parse(JSON.stringify(st));
      for (const o of [stripped.cfg, stripped.rules, stripped.fcfg, stripped.finals.rules]) delete o.tie;
      expect(stripped, 'state equals the old app state once the four tie keys are removed').toEqual(await saved(O.page, OLD_KEY));
    } finally { await O.ctx.close(); await N.ctx.close(); }
  } finally { await root.close(); }
});
