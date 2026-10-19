// Item "UI pass (free app only)". Written from docs/specs/ui-pass.md (invariants 1-8, 10, 11), AGENTS.md,
// docs/ROADMAP.md, docs/specs/tie-rule.md and docs/specs/rulebook-link.md only. Elements are found by id, data-act,
// data-tie-ui hooks and visible text, never by looking at how the app is implemented. Invariant 9 (existing suites
// still pass) is the rest of the suite, see MUTATIONS.md for the run log.
//
// WHAT THIS CANNOT CHECK (spec: "Cannot be tested by the automated suite"): Playwright/Chromium does not emulate the
// phone's on-screen keyboard (the visual viewport never shrinks) and does not emulate the iOS home-indicator inset, so
// env(safe-area-inset-bottom) reads as 0. "Focus hides the bar" is tested through real focus, which is what the CSS
// reacts to, but the keyboard overlap and the inset spacing are for the owner's real-device check.
// Tests never build dist (see require-dist.ts); global-setup serves apps/free/dist.
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { enter, generate, openApp, PREFS_KEY, storedRaw, tab, TOUR_KEY } from './tie-harness';

const REPO = resolve(import.meta.dirname, '../../../..');
const FREE = join(REPO, 'apps/free');
const VH = 800;
const TAB_LABELS = ['Setup', 'Matches', 'Board', 'Finals'];
const NOTE = 'Opens in your browser and needs internet.';
const MANY = Array.from({ length: 24 }, (_, i) => `Player ${i + 1}`);
const TWELVE = MANY.slice(0, 12);

interface Box { x: number; y: number; width: number; height: number }
const navBox = (page: Page): Promise<Box> => page.evaluate(() => {
  const r = document.getElementById('nav')!.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
const toBottom = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 1);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
};
const toTop = async (page: Page) => { await page.evaluate(() => window.scrollTo(0, 0)); };
/** Wait until window.scrollY has not changed for ~300ms (smooth scrolling, if any, has finished). */
const settle = async (page: Page) => {
  let last = -1, same = 0;
  for (let i = 0; i < 60 && same < 4; i++) {
    const y = await page.evaluate(() => window.scrollY);
    same = y === last ? same + 1 : 0; last = y;
    await page.waitForTimeout(80);
  }
};
const approx = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;
async function typePlayers(page: Page, names: string[]) {
  await page.click('#nav button[data-tab="setup"]');
  await page.fill('#players', names.join('\n'));
  await blur(page);
}

test.describe('Invariant 1 and 2: the bar does not move and the page content clears it', () => {
  for (const screen of ['setup (24 players, no schedule)', 'setup (schedule exists)', 'matches'] as const) {
    test(`${screen}: same bbox before and after scrolling to the bottom, bottom edge at the viewport bottom, content ends above it`, async ({ browser }) => {
      const { ctx, page } = await openApp(browser);
      try {
        if (screen.startsWith('setup (24')) await typePlayers(page, MANY);
        else {
          await generate(page, { n: 12, m: 4, names: TWELVE });
          await tab(page, screen === 'matches' ? 'matches' : 'setup');
          await blur(page);
        }
        await toTop(page);
        const scrollH = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(scrollH, 'the page must scroll for this test to mean anything').toBeGreaterThan(VH + 200);
        const before = await navBox(page);
        await toBottom(page);
        const after = await navBox(page);
        expect(after, 'bar bbox unchanged by scrolling').toEqual(before);
        expect(await page.evaluate(() => window.innerHeight)).toBe(VH);
        expect(approx(after.y + after.height, VH), `bar bottom ${after.y + after.height} is the viewport bottom`).toBe(true);
        expect(after.width).toBe(360);
        expect(after.x).toBe(0);
        expect(await page.evaluate(() => getComputedStyle(document.getElementById('nav')!).position)).toBe('fixed');
        // Invariant 2: scrolled to the bottom, nothing in the view extends under the bar, and the last element ends above it.
        const ends = await page.evaluate(() => {
          const view = document.getElementById('view')!;
          const all = [...view.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0 && r.width > 0);
          const last = view.lastElementChild!.getBoundingClientRect();
          return { maxBottom: Math.max(...all.map((r) => r.bottom)), lastBottom: last.bottom, navTop: document.getElementById('nav')!.getBoundingClientRect().top };
        });
        expect(ends.lastBottom, 'last child of #view ends above the bar').toBeLessThanOrEqual(ends.navTop);
        expect(ends.maxBottom, 'lowest element in #view ends above the bar').toBeLessThanOrEqual(ends.navTop);
        // the four tabs are still the same four tabs, at least 44px tall
        expect((await page.locator('#nav button').allInnerTexts()).map((t) => t.trim())).toEqual(TAB_LABELS);
        for (const h of await page.locator('#nav button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
      } finally { await ctx.close(); }
    });
  }

  test('page bottom padding is constant: scroll height is the same with the bar shown and hidden', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await typePlayers(page, MANY);
      const shown = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.focus('#players');
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(shown);
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 3: focus hides the bar, blur restores it', () => {
  test('textarea, number input and select hide it (off-screen, not clickable, labels still in innerText); a button does not', async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await openApp(browser);
    try {
      await generate(page, { n: 12, m: 4, names: TWELVE });
      await tab(page, 'setup');
      await blur(page);
      await toTop(page);
      const home = await navBox(page);
      const textBefore = await page.locator('#nav').innerText();
      for (const l of TAB_LABELS) expect(textBefore).toMatch(new RegExp(l, 'i'));

      const cases: Array<[string, string, string]> = [
        ['textarea', '#players', 'setup'],
        ['select', '#mSel', 'setup'],
        ['number input', '#m0a', 'matches'],
      ];
      for (const [kind, sel, where] of cases) {
        await tab(page, where as 'setup' | 'matches');
        await blur(page);
        await toTop(page);
        const el = page.locator(sel).first();
        await el.focus();
        expect(await page.evaluate(() => document.activeElement?.tagName), kind).toMatch(/TEXTAREA|SELECT|INPUT/);
        const hidden = await navBox(page);
        expect(hidden.y, `${kind}: bar top is at or below the viewport bottom`).toBeGreaterThanOrEqual(VH);
        expect(await page.evaluate(() => getComputedStyle(document.getElementById('nav')!).pointerEvents), `${kind}: pointer-events`).toBe('none');
        // not clickable: whatever is at the old bar position is not the nav or one of its buttons
        const hit = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('#nav'); }, { x: 180, y: home.y + home.height / 2 });
        expect(hit, `${kind}: nothing in #nav receives a click at the old bar position`).toBe(false);
        // still readable by the golden-master harness
        const text = await page.locator('#nav').evaluate((n) => (n as HTMLElement).innerText);
        for (const l of TAB_LABELS) expect(text, `${kind}: #nav innerText keeps ${l}`).toMatch(new RegExp(l, 'i'));
        await blur(page);
        await page.waitForFunction(() => document.getElementById('nav')!.getBoundingClientRect().bottom <= window.innerHeight + 0.5);
        expect(await navBox(page), `${kind}: blur restores the bar to its place`).toEqual(home);
      }

      // a button gets focus: the bar stays
      await tab(page, 'setup');
      await page.locator('button[data-act="generate"]').focus();
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
      expect(await navBox(page)).toEqual(home);
    } finally { await ctx.close(); }
  });

  test('the hidden bar is not display:none or visibility:hidden (computed)', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await page.focus('#players');
      const s = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('nav')!); return { display: c.display, visibility: c.visibility }; });
      expect(s.display).not.toBe('none');
      expect(s.visibility).toBe('visible');
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 4: after saving a score the next match is not under the bar', () => {
  test('every following match card ends above the bar (12 players, 12 matches)', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await openApp(browser);
    try {
      await generate(page, { n: 12, m: 4, names: TWELVE });
      await tab(page, 'matches');
      const total = await page.locator('.mcard').count();
      expect(total).toBe(12);
      for (let i = 0; i < total - 1; i++) {
        expect((await enter(page, `m${i}`, 11, 4)).rejected, `m${i} accepted`).toBe(false);
        await settle(page);
        const r = await page.evaluate((k) => {
          const c = document.querySelectorAll('.mcard')[k].getBoundingClientRect();
          return { top: c.top, bottom: c.bottom, navTop: document.getElementById('nav')!.getBoundingClientRect().top };
        }, i + 1);
        expect(r.bottom, `after saving m${i}, card ${i + 1} bottom ${r.bottom} vs bar top ${r.navTop}`).toBeLessThanOrEqual(r.navTop);
        expect(r.top, `after saving m${i}, card ${i + 1} is in view`).toBeLessThan(r.navTop);
        expect(r.bottom, `after saving m${i}, card ${i + 1} is in view`).toBeGreaterThan(0);
      }
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 4 (scroll padding): focus scrolling and scrollIntoView stop above the bar', () => {
  test('focusing a button far below, and scrollIntoView({block:"nearest"}) on a match card, never leave it under the bar', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await generate(page, { n: 12, m: 4, names: TWELVE });
      await tab(page, 'matches');
      await blur(page);
      for (const id of ['m5', 'm9']) {
        await toTop(page);
        await page.locator(`button[data-act="saveScore"][data-id="${id}"]`).focus();
        const r = await page.evaluate((i) => ({ b: document.querySelector(`button[data-act="saveScore"][data-id="${i}"]`)!.getBoundingClientRect().bottom, navTop: document.getElementById('nav')!.getBoundingClientRect().top }), id);
        expect(r.b, `focused Save score of ${id} ends above the bar`).toBeLessThanOrEqual(r.navTop);
        await blur(page);
        await toTop(page);
        const c = await page.evaluate((k) => { const el = document.querySelectorAll('.mcard')[k] as HTMLElement; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { b: b.bottom, navTop: document.getElementById('nav')!.getBoundingClientRect().top }; }, Number(id.slice(1)));
        expect(c.b, `scrollIntoView(nearest) of card ${id} ends above the bar`).toBeLessThanOrEqual(c.navTop);
      }
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 5: modals are above the bar', () => {
  const topmostIsInside = (page: Page, modalSel: string, x: number, y: number) =>
    page.evaluate(({ s, x, y }) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest(s); }, { s: modalSel, x, y });

  test('confirm modal (Regenerate with saved results): at the bar position the topmost element is the modal, and its buttons are hit', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await generate(page, { n: 4, m: 1, to: 11 });
      await tab(page, 'matches');
      expect((await enter(page, 'm0', 11, 4)).rejected).toBe(false);
      await tab(page, 'setup');
      await blur(page);
      await page.click('button[data-act="generate"]');
      await expect(page.locator('#modal')).toBeVisible();
      const bar = await navBox(page);
      expect(bar.y + bar.height).toBeGreaterThan(VH - 1); // the bar is still docked behind the modal
      for (const x of [20, 180, 340]) expect(await topmostIsInside(page, '#modal', x, bar.y + bar.height / 2), `x=${x} on the bar row`).toBe(true);
      const btns = page.locator('#modal button');
      expect(await btns.count()).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < (await btns.count()); i++) {
        const b = (await btns.nth(i).boundingBox())!;
        const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button') !== null && !document.elementFromPoint(x, y)?.closest('#nav'), { x: b.x + b.width / 2, y: b.y + b.height / 2 });
        expect(hit, `modal button ${i} is not covered by the bar`).toBe(true);
      }
    } finally { await ctx.close(); }
  });

  test('the result image modal is above the bar too', async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await openApp(browser, { init: "Object.defineProperty(navigator,'share',{value:undefined,configurable:true});" });
    try {
      await generate(page, { n: 4, m: 1, to: 11 });
      await tab(page, 'matches');
      expect((await enter(page, 'm0', 11, 4)).rejected).toBe(false);
      await tab(page, 'finals');
      await page.click('button[data-act="startFinals"]');
      expect((await enter(page, 'f', 11, 10)).rejected).toBe(false);
      await page.waitForSelector('.champ');
      await page.click('button[data-act="share"]');
      await expect(page.locator('#imgModal')).toBeVisible({ timeout: 15_000 });
      const bar = await navBox(page);
      for (const x of [20, 180, 340]) expect(await topmostIsInside(page, '#imgModal', x, bar.y + bar.height / 2), `x=${x}`).toBe(true);
    } finally { await ctx.close(); }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Drive the app through every screen and both modals; the callback runs on each.
async function eachScreen(page: Page, fn: (label: string) => Promise<void>): Promise<void> {
  await page.click('#nav button[data-tab="setup"]');
  await fn('setup (empty)');
  await generate(page, { n: 4, m: 1, to: 11 });
  await tab(page, 'setup'); await blur(page);
  await fn('setup (schedule)');
  await tab(page, 'matches'); await fn('matches (unscored)');
  expect((await enter(page, 'm0', 11, 4)).rejected).toBe(false);
  await tab(page, 'matches'); await fn('matches (scored)');
  await tab(page, 'board'); await fn('board');
  await tab(page, 'finals'); await fn('finals (pre-start)');
  await page.click('button[data-act="startFinals"]'); await fn('finals (started)');
  expect((await enter(page, 'f', 11, 10)).rejected).toBe(false);
  await page.waitForSelector('.champ'); await fn('finals (champions)');
  await page.click('button[data-act="share"]');
  await expect(page.locator('#imgModal')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => (document.getElementById('shareImg') as HTMLImageElement | null)?.src.startsWith('data:image'));
  await fn('image modal');
  await page.keyboard.press('Escape');
}
const NO_SHARE = "Object.defineProperty(navigator,'share',{value:undefined,configurable:true});";

test.describe('Invariant 6: pill buttons', () => {
  test('every visible action button (.btn family, header, links, modals) is >= 44px tall with radius >= height/2', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await openApp(browser, { init: NO_SHARE });
    let inspected = 0, headerSeen = 0, linksSeen = 0;
    try {
      const check = async (label: string) => {
        const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.btn')].map((e) => {
          const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
          return {
            text: (e.innerText || e.textContent || '').trim().slice(0, 30), tag: e.tagName, cls: e.className, h: r.height, w: r.width,
            radius: parseFloat(cs.borderTopLeftRadius), visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden',
            inHeader: !!e.closest('header'), isLink: e.tagName === 'A',
          };
        }));
        for (const r of rows.filter((x) => x.visible)) {
          inspected++; if (r.inHeader) headerSeen++; if (r.isLink) linksSeen++;
          expect(r.h, `${label}: "${r.text}" (${r.tag}.${r.cls}) height`).toBeGreaterThanOrEqual(44);
          expect(r.radius, `${label}: "${r.text}" (${r.tag}.${r.cls}) radius ${r.radius} vs height ${r.h}`).toBeGreaterThanOrEqual(r.h / 2 - 0.01);
        }
      };
      await eachScreen(page, check);
      expect(inspected).toBeGreaterThan(12);
      expect(headerSeen, 'at least one header .btn was inspected').toBeGreaterThan(0);
      expect(linksSeen, 'at least one .btn link (Rules card) was inspected').toBeGreaterThan(0);
    } finally { await ctx.close(); }
  });

  test('the Rules links meet the pill rule (they are .btn links)', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      for (const href of ['https://ebooks.usapickleball.org/books/USAP-Official-Rulebook/', 'https://usapickleball.org/rules/']) {
        const m = await page.locator(`a[href="${href}"]`).evaluate((e) => ({ h: e.getBoundingClientRect().height, r: parseFloat(getComputedStyle(e).borderTopLeftRadius) }));
        expect(m.h).toBeGreaterThanOrEqual(44);
        expect(m.r).toBeGreaterThanOrEqual(m.h / 2 - 0.01);
      }
    } finally { await ctx.close(); }
  });

  test('Generate / Regenerate: >= 52px, as wide as the cards, not fixed; Back to matches below it, same width, ghost, >= 44px', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      const measure = () => page.evaluate(() => {
        const g = document.querySelector<HTMLElement>('button[data-act="generate"]')!;
        const cards = [...document.querySelectorAll<HTMLElement>('#view .card')].map((c) => c.getBoundingClientRect().width);
        let fixed = false;
        for (let e: HTMLElement | null = g; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') fixed = true;
        const gr = g.getBoundingClientRect();
        const back = [...document.querySelectorAll<HTMLElement>('button[data-act="tab"][data-tab="matches"]')].find((b) => !b.closest('#nav')) ?? null;
        const bb = back ? back.getBoundingClientRect() : null;
        const bcs = back ? getComputedStyle(back) : null;
        return {
          label: g.innerText.trim(), h: gr.height, w: gr.width, left: gr.left, cardW: cards, fixed,
          back: bb && { h: bb.height, w: bb.width, top: bb.top, left: bb.left, ghost: back!.classList.contains('ghost'), bg: bcs!.backgroundColor, radius: parseFloat(bcs!.borderTopLeftRadius), text: back!.innerText.trim() },
          genBottom: gr.bottom, genTop: gr.top,
        };
      });
      await page.fill('#players', TWELVE.join('\n')); await blur(page);
      let m = await measure();
      expect(m.label).toMatch(/generate schedule/i);
      expect(m.h).toBeGreaterThanOrEqual(52);
      expect(m.fixed, 'Generate is not position:fixed').toBe(false);
      expect(m.cardW.length).toBeGreaterThan(0);
      for (const w of m.cardW) expect(approx(m.w, w, 1), `Generate width ${m.w} vs card ${w}`).toBe(true);
      expect(m.back, 'no Back to matches before a schedule exists').toBeNull();

      await page.selectOption('#mSel', '4');
      await page.click('button[data-act="generate"]');
      await page.waitForSelector('.mcard');
      await tab(page, 'setup'); await blur(page);
      m = await measure();
      expect(m.label).toMatch(/regenerate schedule/i);
      expect(m.h).toBeGreaterThanOrEqual(52);
      expect(m.fixed).toBe(false);
      for (const w of m.cardW) expect(approx(m.w, w, 1), `Regenerate width ${m.w} vs card ${w}`).toBe(true);
      expect(m.back, 'Back to matches shown').not.toBeNull();
      expect(m.back!.text).toBe('Back to matches');
      expect(m.back!.top, 'Back to matches is below Regenerate').toBeGreaterThanOrEqual(m.genBottom - 0.5);
      expect(approx(m.back!.w, m.w, 1), 'same width').toBe(true);
      expect(approx(m.back!.left, m.left, 1)).toBe(true);
      expect(m.back!.h).toBeGreaterThanOrEqual(44);
      expect(m.back!.radius).toBeGreaterThanOrEqual(m.back!.h / 2 - 0.01);
      expect(m.back!.ghost, 'ghost pill').toBe(true);
      expect(m.back!.bg, 'ghost = transparent').toBe('rgba(0, 0, 0, 0)');
    } finally { await ctx.close(); }
  });

  test('not action buttons and unchanged: Play-to tiles and the two-way toggles keep their own shape (not turned into pills)', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      const r = await page.evaluate(() => {
        const tile = document.querySelector<HTMLElement>('[data-ns="cfg"] button[data-k="to"]')!;
        const seg = document.querySelector<HTMLElement>('[data-ns="cfg"] button[data-k="mode"]')!;
        const t = tile.getBoundingClientRect(), s = seg.getBoundingClientRect();
        return { tileRadius: parseFloat(getComputedStyle(tile).borderTopLeftRadius), tileH: t.height, segRadius: parseFloat(getComputedStyle(seg).borderTopLeftRadius), segH: s.height, tileCls: tile.className };
      });
      expect(r.tileRadius, 'Play-to tile is a rounded rectangle, not a pill').toBeLessThan(r.tileH / 2);
      expect(r.segRadius, 'segmented toggle keeps its own (pill) radius').toBeGreaterThanOrEqual(r.segH / 2 - 0.01);
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 7: "Make this my default"', () => {
  const row = (p: Page) => p.locator('[data-tie-ui="default-row"]');
  const btn = (p: Page) => p.locator('[data-tie-ui="default"]');
  const note = (p: Page) => p.locator('[data-tie-ui="default-note"]');
  const pickWin2 = (p: Page) => p.click('[data-ns="cfg"] button[data-k="tie"][data-v="win2"]');
  const pickGolden = (p: Page) => p.click('[data-ns="cfg"] button[data-k="tie"][data-v="golden"]');
  const state = async (p: Page) => ({ text: (await btn(p).innerText()).trim(), disabled: await btn(p).isDisabled() });
  const SAVED = { text: 'Default saved', disabled: true };
  const MAKE = { text: 'Make this my default', disabled: false };

  test('layout: hooks exist once; note is the sibling right after the row; button is a ghost pill on its own row; no inline style', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      for (const l of [row(page), btn(page), note(page)]) await expect(l).toHaveCount(1);
      const r = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('[data-tie-ui="default-row"]')!;
        const b = document.querySelector<HTMLElement>('[data-tie-ui="default"]')!;
        const n = document.querySelector<HTMLElement>('[data-tie-ui="default-note"]')!;
        const bb = b.getBoundingClientRect(), nb = n.getBoundingClientRect(), rb = row.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return {
          btnTag: b.tagName, btnInRow: row.contains(b), noteAfterRow: row.nextElementSibling === n, noteInsideRow: row.contains(n),
          rowButtons: row.querySelectorAll('button').length, rowText: row.innerText.trim(),
          inline: [row, b, n].map((e) => e.getAttribute('style')),
          cls: b.className, h: bb.height, radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor,
          noteBelow: nb.top >= bb.bottom - 0.5, rowEncloses: bb.top >= rb.top - 0.5 && bb.bottom <= rb.bottom + 0.5,
          noteText: n.innerText.trim(), sameLine: nb.top < bb.bottom - 0.5,
          prev: row.previousElementSibling ? (row.previousElementSibling as HTMLElement).getBoundingClientRect().bottom : 0, rowTop: rb.top,
        };
      });
      expect(r.btnTag).toBe('BUTTON');
      expect(r.btnInRow).toBe(true);
      expect(r.rowButtons).toBe(1);
      expect(r.noteAfterRow, 'note is a sibling right after the row').toBe(true);
      expect(r.noteInsideRow).toBe(false);
      expect(r.inline, 'no inline style strings').toEqual([null, null, null]);
      expect(r.cls.split(/\s+/)).toEqual(expect.arrayContaining(['btn', 'ghost']));
      expect(r.bg, 'ghost: transparent background').toBe('rgba(0, 0, 0, 0)');
      expect(r.h).toBeGreaterThanOrEqual(44);
      expect(r.radius).toBeGreaterThanOrEqual(r.h / 2 - 0.01);
      expect(r.noteBelow, 'note is on the line below the button').toBe(true);
      expect(r.rowEncloses).toBe(true);
      expect(r.noteText).toBe('Default for new tournaments: Golden point');
    } finally { await ctx.close(); }
  });

  test('state 1: default golden, selected golden: disabled "Default saved"', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      expect(await state(page)).toEqual(SAVED);
      expect(await storedRaw(page, PREFS_KEY), 'viewing does not write a preference').toBeNull();
    } finally { await ctx.close(); }
  });

  test('state 2: selected win2 while the default is golden: enabled "Make this my default"; back to golden: disabled again', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await pickWin2(page);
      expect(await state(page)).toEqual(MAKE);
      expect(await storedRaw(page, PREFS_KEY), 'selecting alone stores nothing').toBeNull();
      await pickGolden(page);
      expect(await state(page)).toEqual(SAVED);
    } finally { await ctx.close(); }
  });

  test('state 3: pressing it stores the default and the button shows disabled "Default saved"; the note follows; in-progress tournament untouched', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await generate(page, { n: 4, m: 1, to: 11, tie: 'golden' });
      await tab(page, 'matches');
      expect((await enter(page, 'm0', 11, 4)).rejected).toBe(false);
      const tourBefore = await storedRaw(page, TOUR_KEY);
      await tab(page, 'setup'); await blur(page);
      await pickWin2(page);
      expect(await state(page)).toEqual(MAKE);
      await btn(page).click();
      expect(await state(page)).toEqual(SAVED);
      expect(JSON.parse((await storedRaw(page, PREFS_KEY))!)).toEqual({ tie: 'win2' });
      await expect(note(page)).toContainText(/Default for new tournaments:\s*(not golden point|win by 2)/i);
      await pickGolden(page);
      expect(await state(page), 'selected golden now differs from the remembered win2').toEqual(MAKE);
      await pickWin2(page);
      expect(await state(page)).toEqual(SAVED);
      // the saved tournament was not changed by the preference (docs/specs/tie-rule.md), beyond what the tie picks did to cfg
      const t = JSON.parse((await storedRaw(page, TOUR_KEY))!);
      expect(JSON.parse(tourBefore!).rules.tie).toBe('golden');
      expect(t.rules.tie, 'in-progress tournament keeps golden').toBe('golden');
    } finally { await ctx.close(); }
  });

  test('state 4: after reload the remembered default is win2: new tournament starts win2 with disabled "Default saved"; golden then enables it', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await pickWin2(page);
      await btn(page).click();
      expect(await state(page)).toEqual(SAVED);
      // forget the tournament the app auto-saved so the next load is a NEW tournament, keep the preference
      await page.evaluate((k) => localStorage.removeItem(k), TOUR_KEY);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#nav button');
      expect(JSON.parse((await storedRaw(page, PREFS_KEY))!)).toEqual({ tie: 'win2' });
      expect(await page.locator('[data-ns="cfg"] button[data-k="tie"][data-v="win2"]').getAttribute('class')).toMatch(/\bon\b/);
      expect(await state(page)).toEqual(SAVED);
      await expect(note(page)).toContainText(/Default for new tournaments:\s*(not golden point|win by 2)/i);
      await pickGolden(page);
      expect(await state(page)).toEqual(MAKE);
      await pickWin2(page);
      expect(await state(page)).toEqual(SAVED);
    } finally { await ctx.close(); }
  });

  test('reload with a saved tournament keeps working: disabled/enabled follows the selected rule vs the remembered default', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await pickWin2(page); await btn(page).click();
      await generate(page, { n: 4, m: 1, to: 11 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#nav button');
      await tab(page, 'setup');
      // whichever rule the app shows as selected, the button state must be consistent with the note
      const on = await page.locator('[data-ns="cfg"] button[data-k="tie"].on').getAttribute('data-v');
      expect(on === 'win2' ? SAVED : MAKE).toEqual(await state(page));
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 8: every button has a class', () => {
  test('runtime: no <button> without a class attribute on Setup, Matches, Board, Finals, the confirm modal and the image modal', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await openApp(browser, { init: NO_SHARE });
    let total = 0;
    const seen: string[] = [];
    try {
      const check = async (label: string) => {
        const bad = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.hasAttribute('class')).map((b) => b.outerHTML.slice(0, 120)));
        expect(bad, `${label}: buttons without class`).toEqual([]);
        total += await page.locator('button').count(); seen.push(label);
      };
      await check('setup (default row present)');
      expect(await page.locator('[data-tie-ui="default"]').count()).toBe(1);
      await eachScreen(page, check);
      expect(total).toBeGreaterThan(40);
    } finally { await ctx.close(); }
    // confirm modal (separate page: the image modal above stays open)
    const second = await openApp(browser);
    try {
      const page = second.page;
      await generate(page, { n: 4, m: 1, to: 11 });
      await tab(page, 'matches');
      expect((await enter(page, 'm0', 11, 4)).rejected).toBe(false);
      await tab(page, 'setup'); await blur(page);
      await page.click('button[data-act="generate"]');
      await expect(page.locator('#modal')).toBeVisible();
      expect(await page.locator('#modal button').count()).toBeGreaterThanOrEqual(2);
      const bad = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.hasAttribute('class')).map((b) => b.outerHTML.slice(0, 120)));
      expect(bad, 'confirm modal: buttons without class').toEqual([]);
    } finally { await second.ctx.close(); }
  });

  test('static: no "<button" in apps/free/src or apps/free/index.html without class=', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
    walk(join(FREE, 'src'));
    files.push(join(FREE, 'index.html'));
    const bad: string[] = [];
    let seen = 0;
    for (const f of files.filter((x) => /\.(js|ts|html|mjs)$/.test(x))) {
      const txt = readFileSync(f, 'utf8');
      for (const m of txt.matchAll(/<button\b/g)) {
        seen++;
        // the opening tag: up to the first '>' that is not inside a ${...} template expression
        let i = m.index!, depth = 0, end = -1;
        for (; i < txt.length; i++) {
          if (txt[i] === '$' && txt[i + 1] === '{') depth++;
          else if (txt[i] === '}' && depth > 0) depth--;
          else if (txt[i] === '>' && depth === 0) { end = i; break; }
        }
        const tag = txt.slice(m.index!, end + 1);
        if (!/\bclass\s*=/.test(tag)) bad.push(`${f.replace(REPO + '/', '')}: ${tag.slice(0, 100)}`);
      }
    }
    expect(seen, 'found some <button tags to scan').toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });
});

test.describe('Invariant 10: no colour token value differs from main', () => {
  const parseRoot = (html: string): Record<string, string> => {
    const m = html.match(/:root\{([\s\S]*?)\n\}/);
    if (!m) throw new Error(':root block not found');
    const out: Record<string, string> = {};
    for (const t of m[1].matchAll(/(--[a-z0-9-]+):([^;]+);/g)) out[t[1]] = t[2].trim();
    return out;
  };
  const LAYOUT_ONLY = ['--bar-h', '--bar-space'];
  const frozen: Record<string, string> = JSON.parse(readFileSync(join(FREE, 'tests/baselines/main-root-tokens.json'), 'utf8')).tokens;

  function mainTokens(): { tokens: Record<string, string>; from: string } {
    for (const ref of ['main', 'origin/main']) {
      try {
        const html = execFileSync('git', ['show', `${ref}:apps/free/index.html`], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return { tokens: parseRoot(html), from: `git ${ref}` };
      } catch { /* no such ref in this checkout (depth-1 CI) */ }
    }
    return { tokens: frozen, from: 'tests/baselines/main-root-tokens.json' };
  }

  test('the frozen copy of main\'s tokens still equals git main when git main is available', () => {
    const m = mainTokens();
    if (m.from.startsWith('git')) expect(frozen).toEqual(m.tokens);
    expect(Object.keys(frozen).length).toBeGreaterThanOrEqual(15);
  });

  test('every token on main has the same value now (static :root and computed on the page); only --bar-h/--bar-space are added', async ({ browser }) => {
    const main = mainTokens();
    const now = parseRoot(readFileSync(join(FREE, 'index.html'), 'utf8'));
    for (const [k, v] of Object.entries(main.tokens)) expect(now[k], `${k} (main via ${main.from})`).toBe(v);
    const extra = Object.keys(now).filter((k) => !(k in main.tokens));
    expect(extra.sort(), 'new custom properties in :root').toEqual(LAYOUT_ONLY);
    const { ctx, page } = await openApp(browser);
    try {
      const computed = await page.evaluate((names) => Object.fromEntries(names.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])), Object.keys(main.tokens));
      for (const [k, v] of Object.entries(main.tokens)) expect(computed[k], `computed ${k}`).toBe(v);
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 11: the Rules note is centred', () => {
  test('on Setup, the note text is centred within 2px of the links and of the card; text unchanged; ~10px under the second link; equal card padding', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      for (const filled of [false, true]) {
        if (filled) { await page.fill('#players', MANY.join('\n')); await blur(page); }
        const note = page.getByText(NOTE, { exact: true });
        await expect(note).toHaveCount(1);
        const r = await page.evaluate((text) => {
          const card = document.getElementById('rulesCard')!;
          const links = [...card.querySelectorAll('a')].map((a) => a.getBoundingClientRect());
          const el = [...card.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent || '').trim() === text)!;
          const range = document.createRange(); range.selectNodeContents(el);
          const t = range.getBoundingClientRect(), c = card.getBoundingClientRect(), cs = getComputedStyle(card);
          // link label text centre, too (the labels are centred in their pills)
          const labelCentres = [...card.querySelectorAll('a')].map((a) => { const rg = document.createRange(); rg.selectNodeContents(a); const b = rg.getBoundingClientRect(); return b.left + b.width / 2; });
          return {
            noteCentre: t.left + t.width / 2, cardCentre: c.left + c.width / 2, linkCentres: links.map((l) => l.left + l.width / 2), labelCentres,
            exact: (el.textContent || ''), gap: el.getBoundingClientRect().top - links[links.length - 1].bottom, textGap: t.top - links[links.length - 1].bottom,
            pt: cs.paddingTop, pb: cs.paddingBottom, linkCount: links.length, textW: t.width, cardW: c.width,
            fits: el.getBoundingClientRect().right <= 360,
          };
        }, NOTE);
        expect(r.linkCount).toBe(2);
        expect(r.exact).toBe(NOTE);
        expect(Math.abs(r.noteCentre - r.cardCentre), `note vs card centre (filled=${filled})`).toBeLessThanOrEqual(2);
        for (const c of r.linkCentres) expect(Math.abs(r.noteCentre - c), 'note vs link centre').toBeLessThanOrEqual(2);
        for (const c of r.labelCentres) expect(Math.abs(r.noteCentre - c), 'note vs link label centre').toBeLessThanOrEqual(2);
        expect(r.textW, 'the text is narrower than the card, so centring is measurable').toBeLessThan(r.cardW - 20);
        expect(r.gap, 'about 10px between the second link and the note').toBeGreaterThanOrEqual(6);
        expect(r.gap).toBeLessThanOrEqual(14);
        expect(r.pb, 'bottom padding equals top padding').toBe(r.pt);
        expect(r.fits).toBe(true);
      }
    } finally { await ctx.close(); }
  });
});

test.describe('Spec 1: the bar is the same four tabs, same labels and DOM', () => {
  test('nav keeps its buttons (data-tab, data-act="tab", text) in order and keeps its DOM place (inside main, after header, before #view)', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      const r = await page.evaluate(() => ({
        tabs: [...document.querySelectorAll('#nav button')].map((b) => [b.getAttribute('data-tab'), b.getAttribute('data-act'), (b as HTMLElement).innerText.trim()]),
        order: (() => { const h = document.querySelector('header')!, n = document.getElementById('nav')!, m = document.querySelector('main')!; const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); return [before(h, n), m.contains(n), before(n, document.getElementById('view')!)]; })(),
        navIcons: document.querySelectorAll('#nav svg, #nav img').length,
        navLine: getComputedStyle(document.getElementById('nav')!).borderTopWidth,
        navBg: getComputedStyle(document.getElementById('nav')!).backgroundColor,
        bodyBg: getComputedStyle(document.body).backgroundColor,
      }));
      expect(r.tabs).toEqual([['setup', 'tab', 'Setup'], ['matches', 'tab', 'Matches'], ['board', 'tab', 'Board'], ['finals', 'tab', 'Finals']]);
      expect(r.order, 'DOM place unchanged: header, then nav inside main, before #view').toEqual([true, true, true]);
      expect(r.navIcons).toBe(0);
      expect(r.navLine).toBe('1px');
      expect(r.navBg, 'bar uses the page background colour').toBe(r.bodyBg);
    } finally { await ctx.close(); }
  });
});
