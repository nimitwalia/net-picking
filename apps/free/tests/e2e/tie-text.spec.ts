// T5: text follows the setting. Under golden, "win by 2"/"deuce" may appear only inside the tie-rule control itself
// (elements marked data-tie-ui: the 'Win by 2 (deuce)' option and the house-rule hint). Under win2 the rendered text
// (minus data-tie-ui) is unchanged from the original root app.
import { expect, test } from '@playwright/test';
import { HINT, WIN2_RE, attrText, enter, generate, openApp, pickTie, tab, textNoTieUi, toFinalsTab } from './tie-harness';
import { NAMES, openPage, selectWin2, saveScore, setup, startRootServer, views, type Scn } from './harness';

const CANVAS_SPY = `(() => {
  window.__canvasText = [];
  const f = CanvasRenderingContext2D.prototype.fillText, s = CanvasRenderingContext2D.prototype.strokeText;
  CanvasRenderingContext2D.prototype.fillText = function (t) { window.__canvasText.push(String(t)); return f.apply(this, arguments); };
  CanvasRenderingContext2D.prototype.strokeText = function (t) { window.__canvasText.push(String(t)); return s.apply(this, arguments); };
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
})();`;

test('golden: no "win by 2" / "deuce" text anywhere outside the tie-rule control (all views, errors, modal, share image)', async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page, errors } = await openApp(browser, { init: CANVAS_SPY });
  const snaps: Array<[string, string]> = [];
  const snap = async (label: string) => {  snaps.push([label, (await textNoTieUi(page)) + '\n' + (await attrText(page))]); };
  try {
    await snap('setup (empty)');
    await page.fill('#players', NAMES.slice(0, 5).join('\n'));
    await snap('setup (players typed)');
    await generate(page, { n: 5, m: 4, to: 11, tie: 'golden', names: NAMES.slice(0, 5) });
    await snap('matches (unscored)');
    // error messages
    const msgs: string[] = [];
    for (const [a, b] of [[10, 10], [12, 10], [9, 8], [11, 11], [0, 0]]) {
      const r = await enter(page, 'm0', a, b);
      expect(r.rejected, `${a}-${b}`).toBe(true);
      msgs.push(r.msg);
    }
    snaps.push(['golden error messages', msgs.join('\n')]);
    await snap('matches (with visible error)');
    for (let i = 0; i < 5; i++) expect((await enter(page, `m${i}`, i % 2 ? 11 : 4, i % 2 ? 10 : 11)).rejected).toBe(false);
    await snap('matches (all scored)');
    await tab(page, 'setup'); await snap('setup (schedule exists, all scored)');
    await tab(page, 'board'); await snap('board');
    await tab(page, 'finals'); await snap('finals (pre-start, final scoring card)');
    await page.click('button[data-act="startFinals"]');
    await snap('final (started)');
    const fe = await enter(page, 'f', 10, 10);
    expect(fe.rejected).toBe(true);
    snaps.push(['final error', fe.msg]);
    expect((await enter(page, 'f', 11, 10)).rejected).toBe(false);
    await page.waitForSelector('.champ');
    await snap('final (champions)');
    // modal text: changing a group score with finals present
    await tab(page, 'matches');
    await page.fill('#m0a', '11'); await page.fill('#m0b', '2');
    await page.click('button[data-act="saveScore"][data-id="m0"]');
    snaps.push(['confirm modal', (await page.locator('#modal').innerText())]);
    await page.click('button[data-act="mNo"]');
    // share image
    await tab(page, 'finals');
    await page.click('button[data-act="share"]');
    await expect(page.locator('#imgModal')).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => (document.getElementById('shareImg') as HTMLImageElement).src.startsWith('data:image'));
    const canvas: string[] = await page.evaluate(() => (window as any).__canvasText);
    expect(canvas.length, 'share image drew text').toBeGreaterThan(5);
    snaps.push(['share image canvas text', canvas.join('\n')]);
    snaps.push(['share modal', await page.locator('#imgModal').innerText()]);
    await page.click('button[data-act="imgClose"]');
    await tab(page, 'board'); await snap('board (after final)');
    expect(errors).toEqual([]);

    const leaks = snaps.filter(([, t]) => WIN2_RE.test(t)).map(([l, t]) => `${l}: ${t.match(WIN2_RE)![0]} ... ${t.slice(Math.max(0, t.search(WIN2_RE) - 40), t.search(WIN2_RE) + 40).replace(/\n/g, ' | ')}`);
    expect(leaks, 'win-by-2 wording leaked into a golden view').toEqual([]);
    // the golden wording is actually present in the rule lines (text follows the setting, not just deleted)
    const all = snaps.map(([, t]) => t).join('\n');
    expect(all).toMatch(/golden/i);
  } finally { await ctx.close(); }
});

test('golden: scoring hint, per-match rule line and final rule chip say golden, not win by 2', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);
  try {
    await toFinalsTab(page, { tie: 'golden' });
    await page.click('button[data-act="startFinals"]');
    await expect(page.locator('.rchip')).toContainText(/golden/i);
    await expect(page.locator('.rchip')).not.toContainText(WIN2_RE);
    await tab(page, 'matches');
    await expect(page.locator('.rhint').first()).toContainText(/golden/i);
    await expect(page.locator('.rhint').first()).not.toContainText(WIN2_RE);
  } finally { await ctx.close(); }
});

test('golden Setup: the only visible win-by-2 wording is inside data-tie-ui elements; hint text is exact', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);
  try {
    for (const phase of ['empty', 'with schedule']) {
      if (phase === 'with schedule') await generate(page, { n: 4, m: 1 }), await tab(page, 'setup');
      const hits = await page.evaluate((src) => {
        const re = new RegExp(src, 'i');
        const out: Array<{ text: string; inTie: boolean }> = [];
        const w = document.createTreeWalker(document.getElementById('view')!, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const el = n.parentElement!;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
          if (re.test(n.textContent ?? '')) out.push({ text: (n.textContent ?? '').trim(), inTie: !!el.closest('[data-tie-ui]') });
        }
        return out;
      }, WIN2_RE.source);
      expect(hits.filter((h) => !h.inTie), `${phase}: win-by-2 text outside tie-ui`).toEqual([]);
      expect(hits.map((h) => h.text).sort(), phase).toEqual([HINT, 'Win by 2 (deuce)'].sort());
      expect(await page.locator('p[data-tie-ui="hint"]').innerText()).toBe(HINT);
    }
  } finally { await ctx.close(); }
});

test('win2 Setup shows the same exact hint and the original "Win by 2." scoring line', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);
  try {
    await pickTie(page, 'cfg', 'win2');
    expect(await page.locator('p[data-tie-ui="hint"]').innerText()).toBe(HINT);
    await expect(page.locator('[data-ns="cfg"] p.hint:not([data-tie-ui])')).toContainText('Win by 2.');
  } finally { await ctx.close(); }
});

// ---- win2 text unchanged from the original app (data-tie-ui dropped by views()) ----
test('win2: Setup, Matches, errors, Finals text equals the original root app', async ({ browser }) => {
  test.setTimeout(120_000);
  const root = await startRootServer();
  try {
    const run = async (base: string) => {
      const { ctx, page } = await openPage(browser, base, 7);
      try {
        const out: Record<string, string> = {};
        const s: Scn = { n: 5, m: 4, to: 15, mode: 'rally', seed: 7, idx: 0 };
        await selectWin2(page); // new app defaults to golden; old has no control (no-op)
        out.setupEmpty = await views(page);
        await setup(page, s);
        await tab(page, 'setup'); out.setupSchedule = await views(page);
        await tab(page, 'matches');
        const errs: string[] = [];
        for (const [a, b] of [[15, 15], [14, 0], [15, 14], [17, 15], [20, 14], [0, 0]]) {
          await saveScore(page, 'm0', a, b);
          errs.push(`${a}-${b}:${await page.locator('#m0err').textContent()}`);
        }
        out.errs = errs.join('\n');
        out.matchesWithErr = await views(page);
        for (let i = 0; i < 5; i++) await saveScore(page, `m${i}`, i % 2 ? 17 : 15, i % 2 ? 15 : 3);
        out.matches = await views(page);
        await tab(page, 'finals'); out.finalsPre = await views(page);
        await page.click('button[data-act="startFinals"]'); out.final = await views(page);
        await saveScore(page, 'f', 14, 14); out.finalErr = (await page.locator('#ferr').textContent()) ?? '';
        await saveScore(page, 'f', 15, 9); out.champ = await views(page);
        await page.click('button[data-act="newTournament"]'); await page.click('button[data-act="mYes"]'); await selectWin2(page); // New resets to the remembered default (golden), not to the previous choice
        out.afterNew = await views(page);
        return out;
      } finally { await ctx.close(); }
    };
    const oldBase = root.base, newBase = process.env.PREVIEW_BASE_URL!;
    const o = await run(oldBase);
    const n = await run(newBase);
    for (const k of Object.keys(o)) expect(n[k], k).toBe(o[k]);
  } finally { await root.close(); }
});
