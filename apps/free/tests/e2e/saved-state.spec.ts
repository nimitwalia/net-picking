// G2 saved-state compatibility. Fixtures (tests/fixtures/*.json) are old-format saves written from the
// ORIGINAL root code: its migrate() block (cfg, rules, finals.sA/sB -> s1/s2, finals.rules) and finalTeams()
// (finals.seeds with no finals.teams). Each is injected into localStorage under each app's own key before
// load. Then: every tab is reachable and its text is identical old vs new. Clicking a tab calls save(), which
// is what re-saves the (migrated) state; the saved JSON must be identical old vs new. Further actions
// (entering a score, clearing, restarting the final) are replayed on both and compared again.
import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { NEW_KEY, OLD_KEY, openPage, saveScore, saved, startLegacyServer, tab, views, type Env } from './harness';

const dir = resolve(import.meta.dirname, '../fixtures');
const FIXTURES = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

let env: Env;
let closeRoot: () => Promise<void>;
test.beforeAll(async () => {
  const r = await startLegacyServer();
  closeRoot = r.close;
  env = { oldBase: r.base, newBase: process.env.NEW_BASE_OVERRIDE ?? process.env.APP_BASE_URL! };
});
test.afterAll(async () => { await closeRoot?.(); });

const TABS = ['setup', 'matches', 'board', 'finals'] as const;

async function load(browser: any, base: string, key: string, raw: string) {
  // inject only when absent so that reloads keep the app's own re-saved state
  return openPage(browser, base, 99, undefined, {
    fn: ({ k, v }: { k: string; v: string }) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); },
    arg: { k: key, v: raw },
  });
}

test('fixture directory has the five required kinds', () => {
  for (const f of ['legacy-seeds', 'legacy-sAsB', 'no-cfg-mid', 'mid', 'complete-with-finals']) {
    expect(FIXTURES, f).toContain(`${f}.json`);
  }
});

for (const f of FIXTURES) {
  test(`saved state ${f}: all tabs and re-saved JSON identical old vs new`, async ({ browser }) => {
    const raw = readFileSync(resolve(dir, f), 'utf8');
    const src = JSON.parse(raw);
    const run = async (base: string, key: string) => {
      const { ctx, page } = await load(browser, base, key, raw);
      try {
        const out: Record<string, string> = {};
        out.initial = await views(page);
        for (const t of TABS) {
          const b = page.locator(`#nav button[data-tab="${t}"]`);
          if (await b.isDisabled()) { out[t] = 'DISABLED'; continue; }
          await b.click();
          out[t] = await views(page);
        }
        const state: any = await saved(page, key);
        const extra: Record<string, unknown> = {};
        // replay actions
        const hasMatches = (src.matches ?? []).length > 0;
        if (hasMatches) {
          const next = src.matches.findIndex((m: any) => !m.winner);
          await tab(page, 'matches');
          if (next >= 0) {
            await saveScore(page, `m${next}`, src.rules?.to ?? src.cfg?.to ?? 11, 2);
            extra.afterScore = await views(page);
          } else {
            // completed: changing a group score with finals present asks for confirmation
            await saveScore(page, 'm0', 4, src.rules?.to ?? src.cfg?.to ?? 11);
            if (await page.locator('#modal').isVisible()) await page.click('button[data-act="mYes"]');
            extra.afterRescore = await views(page);
            await tab(page, 'finals');
            extra.finalsAfterRescore = await views(page);
            if ((await page.locator('button[data-act="startFinals"]').count()) > 0) {
              await page.click('button[data-act="startFinals"]');
              extra.restarted = await views(page);
            }
          }
          extra.finalState = await saved(page, key);
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#nav button');
        extra.afterReload = await views(page);
        return { out, state, extra };
      } finally { await ctx.close(); }
    };
    const [o, n] = await Promise.all([run(env.oldBase, OLD_KEY), run(env.newBase, NEW_KEY)]);
    expect(n.out).toEqual(o.out);
    expect(n.state).toEqual(o.state);
    expect(n.extra).toEqual(o.extra);

    // Migration outcomes are spelled out from the original migrate() block, independent of old/new.
    for (const st of [o.state, n.state] as any[]) {
      expect(st.cfg).toEqual(src.cfg ?? { mode: 'side', to: 11 });
      expect(st.rules).toEqual(src.rules ?? st.cfg);
      if (src.finals) {
        const legacy = src.finals.s1 === undefined;
        if (legacy) {
          expect(st.finals.s1).toBe(Number.isFinite(src.finals.sA) ? src.finals.sA : null);
          expect(st.finals.s2).toBe(Number.isFinite(src.finals.sB) ? src.finals.sB : null);
        } else {
          expect(st.finals.s1).toBe(src.finals.s1);
        }
        expect(st.finals.rules).toEqual(src.finals.rules ?? st.rules);
      }
    }
    // legacy finals with `seeds` and no `teams`: champion view reads A = seeds 1&4, B = seeds 2&3
    if (src.finals?.seeds && !src.finals.teams && src.finals.winner) {
      const [s0, s1, s2, s3] = src.finals.seeds;
      const champ = src.finals.winner === 1 ? `${s0} & ${s3}` : `${s1} & ${s2}`;
      expect(o.out.finals).toContain(champ);
    }
  });
}
