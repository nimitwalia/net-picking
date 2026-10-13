// T2: score validity under each tie rule, in the app at 360px. Oracles are written from docs/specs/tie-rule.md
// (golden) and the original win-by-2 rule, independent of the implementation.
import { expect, test } from '@playwright/test';
import { enter, generate, openApp, pickTie, stored, tab, toFinalsTab } from './tie-harness';

const TOS = [7, 11, 15, 21];
const goldenOk = (a: number, b: number, to: number) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && ((a === to && b < to) || (b === to && a < to));
const win2Ok = (a: number, b: number, to: number) => {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi === to && lo <= to - 2) || (hi > to && hi - lo === 2 && lo >= to - 1);
};

for (const to of TOS) {
  for (const rule of ['golden', 'win2'] as const) {
    test(`group match, ${rule}, to ${to}: every score in the grid is accepted iff the rule says so`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { ctx, page, errors } = await openApp(browser);
      try {
        await generate(page, { n: 4, m: 1, to, tie: rule });
        await tab(page, 'matches');
        const oracle = rule === 'golden' ? goldenOk : win2Ok;
        const max = to + (rule === 'golden' ? 2 : 4);
        const wrong: string[] = [];
        for (let a = 0; a <= max; a++) for (let b = 0; b <= max; b++) {
          const before = (await stored(page)).matches[0];
          const r = await enter(page, 'm0', a, b);
          const st = (await stored(page)).matches[0];
          const accepted = !r.rejected;
          if (accepted !== oracle(a, b, to)) wrong.push(`${a}-${b} accepted=${accepted}`);
          if (accepted) { if (!(st.winner && st.s1 === a && st.s2 === b)) wrong.push(`${a}-${b} accepted but not stored`); }
          else {
            if (JSON.stringify(st) !== JSON.stringify(before)) wrong.push(`${a}-${b} rejected but state changed`);
            if (rule === 'golden') {
              if (!r.msg.includes(String(to))) wrong.push(`${a}-${b} message does not name target ${to}: ${r.msg}`);
              if (!/golden point/i.test(r.msg)) wrong.push(`${a}-${b} message does not name the rule: ${r.msg}`);
              if (!/valid/i.test(r.msg) || !/\d+\s*[–-]\s*\d+/.test(r.msg.replace(`${a}–${b}`, ''))) wrong.push(`${a}-${b} message does not say what a valid score looks like: ${r.msg}`);
              if (/win by 2|deuce/i.test(r.msg)) wrong.push(`${a}-${b} golden message mentions win by 2: ${r.msg}`);
            }
          }
        }
        expect(wrong).toEqual([]);
        expect(errors).toEqual([]);
      } finally { await ctx.close(); }
    });
  }

  test(`named cases, to ${to}`, async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await generate(page, { n: 4, m: 1, to, tie: 'golden' });
      await tab(page, 'matches');
      for (const [a, b] of [[to, to - 1], [to - 1, to], [to, 0], [0, to]]) expect((await enter(page, 'm0', a, b)).rejected, `golden ${a}-${b}`).toBe(false);
      for (const [a, b] of [[to - 1, to - 1], [to + 1, to - 1], [to - 2, to - 3], [to, to], [to + 1, to], [0, 0]]) expect((await enter(page, 'm0', a, b)).rejected, `golden ${a}-${b}`).toBe(true);
    } finally { await ctx.close(); }
    const o2 = await openApp(browser);
    try {
      await generate(o2.page, { n: 4, m: 1, to, tie: 'win2' });
      await tab(o2.page, 'matches');
      expect((await enter(o2.page, 'm0', to - 1, to)).rejected, 'win2 to-1 vs to').toBe(true);
      expect((await enter(o2.page, 'm0', to + 1, to - 1)).rejected, 'win2 to+1 vs to-1').toBe(false);
    } finally { await o2.ctx.close(); }
  });

  for (const [g, f] of [['golden', 'win2'], ['win2', 'golden'], ['golden', 'golden'], ['win2', 'win2']] as const) {
    test(`final follows its own setting, to ${to}: group ${g}, final ${f}`, async ({ browser }) => {
      const { ctx, page } = await openApp(browser);
      try {
        await toFinalsTab(page, { to, tie: g });
        // the final's card starts from the group setting, and can be changed independently
        await expect(page.locator('[data-ns="fcfg"] button[data-k="tie"][data-v="' + g + '"]')).toHaveClass(/\bon\b/);
        await pickTie(page, 'fcfg', f);
        await page.click('button[data-act="startFinals"]');
        const st = await stored(page);
        expect(st.rules.tie ?? 'win2').toBe(g);
        expect(st.finals.rules.tie).toBe(f);
        // probe set
        const accept = f === 'golden' ? [[to, to - 1], [to - 1, to]] : [[to + 1, to - 1], [to, to - 2]];
        const reject = f === 'golden' ? [[to - 1, to - 1], [to + 1, to - 1], [to - 2, to - 3], [to, to]] : [[to - 1, to], [to, to - 1], [to - 1, to - 1]];
        for (const [a, b] of reject) expect((await enter(page, 'f', a, b)).rejected, `final(${f}) ${a}-${b}`).toBe(true);
        for (const [a, b] of accept) expect((await enter(page, 'f', a, b)).rejected, `final(${f}) ${a}-${b}`).toBe(false);
        await expect(page.locator('.champ')).toBeVisible();
        // group stage setting is untouched by the final's setting
        expect((await stored(page)).rules.tie ?? 'win2').toBe(g);
      } finally { await ctx.close(); }
    });
  }
}

test('changing the setup tie before any score updates the schedule; after a score it does not', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);
  try {
    await generate(page, { n: 4, m: 2, tie: 'golden' });
    expect((await stored(page)).rules.tie).toBe('golden');
    await tab(page, 'setup');
    await pickTie(page, 'cfg', 'win2');
    const s1 = await stored(page);
    expect(s1.cfg.tie).toBe('win2');
    expect(s1.rules.tie, 'no score saved yet: schedule follows (as mode/to do)').toBe('win2');
    await tab(page, 'matches');
    expect((await enter(page, 'm0', 11, 3)).rejected).toBe(false);
    await tab(page, 'setup');
    await pickTie(page, 'cfg', 'golden');
    const s2 = await stored(page);
    expect(s2.cfg.tie).toBe('golden');
    expect(s2.rules.tie, 'scores exist: current tournament keeps its rule').toBe('win2');
    await tab(page, 'matches');
    expect((await enter(page, 'm1', 10, 11)).rejected, 'm1 still win2').toBe(true);
  } finally { await ctx.close(); }
});
