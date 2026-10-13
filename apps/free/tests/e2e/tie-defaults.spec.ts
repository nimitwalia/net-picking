// T3 (defaults and legacy saves) and T4 (remembered default), from docs/specs/tie-rule.md:
//  - new tournaments default to golden; a saved tournament with no tie value is win2 and the app must not invent one;
//  - the remembered default is a device preference that never changes a tournament that already exists;
//  - a throwing localStorage (private mode, quota) must not break the app.
import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOUR_KEY, PREFS_KEY, enter, generate, isOn, openApp, pickTie, stored, storedRaw, tab, tiePaths, tieBtn } from './tie-harness';

const dir = resolve(import.meta.dirname, '../fixtures');
const FIXTURES = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

test('new tournament (empty storage) defaults to golden', async ({ browser }) => {
  const { ctx, page, errors } = await openApp(browser);
  try {
    expect(await isOn(page, 'cfg', 'golden')).toBe(true);
    expect(await isOn(page, 'cfg', 'win2')).toBe(false);
    expect(await storedRaw(page, PREFS_KEY), 'no preference is written just by opening the app').toBeNull();
    await generate(page, { n: 4, m: 1, to: 11 });
    const st = await stored(page);
    expect(st.cfg.tie).toBe('golden');
    expect(st.rules.tie).toBe('golden');
    await tab(page, 'matches');
    expect((await enter(page, 'm0', 10, 11)).rejected).toBe(false);
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

test('toggling the tie rule alone does not write the remembered default', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);
  try {
    await pickTie(page, 'cfg', 'win2');
    await pickTie(page, 'cfg', 'golden');
    expect(await storedRaw(page, PREFS_KEY)).toBeNull();
  } finally { await ctx.close(); }
});

for (const f of FIXTURES) {
  test(`legacy save ${f}: behaves as win2 and no tie value is ever invented`, async ({ browser }) => {
    test.setTimeout(120_000);
    const raw = readFileSync(resolve(dir, f), 'utf8');
    const src = JSON.parse(raw);
    expect(tiePaths(src), 'fixture itself has no tie value').toEqual([]);
    const to: number = src.rules?.to ?? src.cfg?.to ?? 11;
    // A golden remembered default must not leak into an existing save.
    const { ctx, page, errors } = await openApp(browser, { storage: { [TOUR_KEY]: raw, [PREFS_KEY]: JSON.stringify({ tie: 'golden' }) } });
    try {
      const noTie = async (where: string) => expect(tiePaths(await stored(page)), `tie value appeared ${where}`).toEqual([]);
      await noTie('after load');
      await tab(page, 'setup');
      expect(await isOn(page, 'cfg', 'win2'), 'setup shows win2 selected').toBe(true);
      expect(await isOn(page, 'cfg', 'golden')).toBe(false);
      await expect(page.locator('[data-ns="cfg"] p.hint:not([data-tie-ui])')).toContainText('Win by 2.');
      for (const t of ['setup', 'matches', 'board', 'finals'] as const) {
        const b = page.locator(`#nav button[data-tab="${t}"]`);
        if (await b.isDisabled()) continue;
        await b.click();
        await noTie(`after viewing ${t}`);
      }
      const hasMatches = src.matches.length > 0;
      if (hasMatches) {
        await tab(page, 'matches');
        await expect(page.locator('.rhint').first()).toContainText(/win by 2/i);
        const firstOpen = src.matches.findIndex((m: any) => !m.winner);
        const id = firstOpen >= 0 ? `m${firstOpen}` : 'm0';
        const r = await enter(page, id, to - 1, to);
        expect(r.rejected, `10-11 analogue (${to - 1}-${to}) rejected for ${id}`).toBe(true);
        expect(r.msg).toMatch(/win by 2/i);
        if (src.finals) {
          await tab(page, 'finals');
          if (await page.locator('#fa').count()) {
            await expect(page.locator('.rchip')).toContainText(/win by 2/i);
            expect((await enter(page, 'f', to - 1, to)).rejected, 'final rejects 10-11 analogue').toBe(true);
          }
          await tab(page, 'matches');
        }
        expect((await enter(page, id, to, 3)).rejected, 'valid win2 score accepted').toBe(false);
        if (await page.locator('#modal').isVisible()) await page.click('button[data-act="mYes"]');
        await noTie('after saving a score');
      }
      // Only an explicit user change stores a value, and only in cfg (the setup card), never in the existing schedule.
      await tab(page, 'setup');
      await pickTie(page, 'cfg', 'golden');
      const st = await stored(page);
      expect(st.cfg.tie).toBe('golden');
      if (hasMatches) expect(st.rules.tie, 'existing schedule keeps its rule').toBeUndefined();
      expect(errors).toEqual([]);
    } finally { await ctx.close(); }
  });
}

test('legacy save is win2 even with no prefs at all (golden is not applied to missing values)', async ({ browser }) => {
  const raw = readFileSync(resolve(dir, 'no-cfg-mid.json'), 'utf8');
  const { ctx, page } = await openApp(browser, { storage: { [TOUR_KEY]: raw } });
  try {
    await tab(page, 'matches');
    const open = JSON.parse(raw).matches.findIndex((m: any) => !m.winner);
    expect((await enter(page, `m${open}`, 10, 11)).rejected).toBe(true);
  } finally { await ctx.close(); }
});

// ---------------- T4 ----------------
const DEFAULT_BTN = 'button[data-act="makeDefault"]';

test('make this my default (win2) stores exactly {"tie":"win2"}; a new device-tournament then starts win2', async ({ browser }) => {
  const { ctx, page, errors } = await openApp(browser);
  try {
    await pickTie(page, 'cfg', 'win2');
    await page.click(DEFAULT_BTN);
    await expect(page.locator(DEFAULT_BTN)).toHaveText('Default saved');
    await expect(page.locator('[data-tie-ui="default-note"], [data-tie-ui] .hint').filter({ hasText: 'Default for new tournaments' }).first()).toContainText(/not golden point/i);
    expect(JSON.parse((await storedRaw(page, PREFS_KEY))!)).toEqual({ tie: 'win2' });
    // no tournament yet exists on the device: remove the saved setup state and reload
    await page.evaluate((k) => localStorage.removeItem(k), TOUR_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav button');
    expect(await isOn(page, 'cfg', 'win2')).toBe(true);
    expect(await isOn(page, 'cfg', 'golden')).toBe(false);
    await generate(page, { n: 4, m: 1, to: 11 });
    const st = await stored(page);
    expect([st.cfg.tie, st.rules.tie]).toEqual(['win2', 'win2']);
    await tab(page, 'matches');
    expect((await enter(page, 'm0', 10, 11)).rejected).toBe(true);
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

test('make this my default (golden) stores {"tie":"golden"}', async ({ browser }) => {
  const { ctx, page } = await openApp(browser, { storage: { [PREFS_KEY]: '{"tie":"win2"}' } });
  try {
    await pickTie(page, 'cfg', 'golden');
    await page.click(DEFAULT_BTN);
    expect(JSON.parse((await storedRaw(page, PREFS_KEY))!)).toEqual({ tie: 'golden' });
    await expect(page.locator('[data-tie-ui]').filter({ hasText: 'Default for new tournaments' }).last()).not.toContainText(/not golden/i);
  } finally { await ctx.close(); }
});

test('a stored win2 default is honoured by a fresh device state', async ({ browser }) => {
  const { ctx, page } = await openApp(browser, { storage: { [PREFS_KEY]: '{"tie":"win2"}' } });
  try {
    expect(await isOn(page, 'cfg', 'win2')).toBe(true);
    await generate(page, { n: 4, m: 1 });
    expect((await stored(page)).rules.tie).toBe('win2');
  } finally { await ctx.close(); }
});

test('changing the remembered default never alters a tournament in progress; reload keeps both', async ({ browser }) => {
  const { ctx, page, errors } = await openApp(browser);
  try {
    await generate(page, { n: 4, m: 2, to: 11, tie: 'golden' });
    await tab(page, 'matches');
    expect((await enter(page, 'm0', 11, 10)).rejected).toBe(false);
    const before = await stored(page);
    expect(before.rules.tie).toBe('golden');
    // change the default to win2 via the UI: select win2 in the setup card, press the button
    await tab(page, 'setup');
    await pickTie(page, 'cfg', 'win2');
    await page.click(DEFAULT_BTN);
    expect(JSON.parse((await storedRaw(page, PREFS_KEY))!)).toEqual({ tie: 'win2' });
    const after = await stored(page);
    expect(after.rules, 'schedule rules untouched').toEqual(before.rules);
    expect(after.matches, 'matches untouched').toEqual(before.matches);
    expect(after.cfg.tie, 'setup card shows the new choice').toBe('win2');
    await tab(page, 'matches');
    expect((await enter(page, 'm1', 10, 11)).rejected, 'in-progress tournament is still golden').toBe(false);
    // second page of the same context writes the pref directly (another tab): still no change
    const p2 = await ctx.newPage();
    await p2.goto(page.url());
    await p2.evaluate((k) => localStorage.setItem(k, '{"tie":"golden"}'), PREFS_KEY);
    await p2.close();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav button');
    const rel = await stored(page);
    expect(rel.rules.tie).toBe('golden');
    expect(rel.finals ?? null).toBeNull();
    expect(JSON.parse((await storedRaw(page, PREFS_KEY))!)).toEqual({ tie: 'golden' });
    await tab(page, 'matches');
    expect((await enter(page, 'm1', 11, 10)).rejected).toBe(false);
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

test('New flow after a win2 default (selected win2) starts a win2 tournament; observed behaviour when they differ is logged', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);
  try {
    await generate(page, { n: 4, m: 1, tie: 'win2' });
    await tab(page, 'setup');
    await page.click(DEFAULT_BTN);
    await page.click('button[data-act="newTournament"]');
    await page.click('button[data-act="mYes"]');
    const st = await stored(page);
    expect(st.matches).toEqual([]);
    expect(await isOn(page, 'cfg', 'win2')).toBe(true);
    await generate(page, { n: 4, m: 1 });
    expect((await stored(page)).rules.tie).toBe('win2');
    // differing case: default golden, previous tournament win2. Spec only says the default applies to new tournaments.
    await tab(page, 'setup');
    await page.evaluate((k) => localStorage.setItem(k, '{"tie":"golden"}'), PREFS_KEY);
    await page.click('button[data-act="newTournament"]');
    await page.click('button[data-act="mYes"]');
    console.log('NEW-FLOW OBSERVATION: prefs=golden, previous win2 -> new tournament cfg.tie =', (await stored(page)).cfg.tie, '(golden button on:', await isOn(page, 'cfg', 'golden'), ')');
  } finally { await ctx.close(); }
});

// ---- throwing localStorage ----
const THROW_GET_PREFS = `(() => { const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { if (k === '${PREFS_KEY}') throw new Error('blocked'); return g.apply(this, arguments); }; })();`;
const THROW_SET_PREFS = `(() => { const s = Storage.prototype.setItem; Storage.prototype.setItem = function (k) { if (k === '${PREFS_KEY}') throw new DOMException('quota', 'QuotaExceededError'); return s.apply(this, arguments); }; })();`;
const THROW_ALL = `(() => { Storage.prototype.getItem = function () { throw new Error('blocked'); }; Storage.prototype.setItem = function () { throw new Error('blocked'); }; })();`;

test('prefs getItem throws: app loads, falls back to golden, still works', async ({ browser }) => {
  const { ctx, page, errors } = await openApp(browser, { init: THROW_GET_PREFS });
  try {
    expect(await isOn(page, 'cfg', 'golden')).toBe(true);
    await generate(page, { n: 4, m: 1, to: 11 });
    await tab(page, 'matches');
    expect((await enter(page, 'm0', 10, 11)).rejected).toBe(false);
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

test('prefs setItem throws: pressing the default button does not crash and the app stays usable', async ({ browser }) => {
  const { ctx, page, errors } = await openApp(browser, { init: THROW_SET_PREFS });
  try {
    await pickTie(page, 'cfg', 'win2');
    await page.click(DEFAULT_BTN);
    expect(errors, 'no uncaught error from the click').toEqual([]);
    await tab(page, 'setup');
    expect(await isOn(page, 'cfg', 'win2')).toBe(true);
    await generate(page, { n: 4, m: 1 });
    expect((await stored(page)).rules.tie, 'tournament still saves').toBe('win2');
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

test('all localStorage access throws: app loads with golden and the buttons do not crash', async ({ browser }) => {
  const { ctx, page, errors } = await openApp(browser, { init: THROW_ALL });
  try {
    expect(await isOn(page, 'cfg', 'golden')).toBe(true);
    await pickTie(page, 'cfg', 'win2');
    await page.click(DEFAULT_BTN);
    await page.fill('#players', 'A\nB\nC\nD');
    await page.selectOption('#mSel', '1');
    await page.click('button[data-act="generate"]');
    await page.waitForSelector('.mcard');
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

for (const bad of ['garbage', '{"tie":"bogus"}', '{"tie":null}', '[]', '"win2"', 'null', '{"tie":5}', '']) {
  test(`corrupt prefs value ${JSON.stringify(bad)} falls back to golden`, async ({ browser }) => {
    const { ctx, page, errors } = await openApp(browser, { storage: { [PREFS_KEY]: bad } });
    try {
      expect(await isOn(page, 'cfg', 'golden')).toBe(true);
      expect(await tieBtn(page, 'cfg', 'win2').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally { await ctx.close(); }
  });
}
