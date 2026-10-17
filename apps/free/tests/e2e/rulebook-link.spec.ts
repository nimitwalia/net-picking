// Item "Rulebook link (free app)". Written from docs/specs/rulebook-link.md, docs/RULES_SOURCES.md and AGENTS.md
// only; links are found by href and visible label, never by implementation class names.
// The tests never build dist (see require-dist.ts); global-setup serves apps/free/dist.
import { expect, test, type Page, type Request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generate, enter, tab, openApp, TOUR_KEY, PREFS_KEY } from './tie-harness';

const REPO = resolve(import.meta.dirname, '../../../..');
const DIST = join(REPO, 'apps/free/dist');
const PUB = join(REPO, 'apps/free/public');
const BASELINE = JSON.parse(readFileSync(resolve(import.meta.dirname, '../baselines/rulebook-baseline.json'), 'utf8')) as {
  cacheName: string; publicSha256: Record<string, string>; textRuns: string[];
};

// Spec: the two links, in this order, with these labels.
const SPEC_LINKS = [
  { label: 'Official rulebook (USA Pickleball)', href: 'https://ebooks.usapickleball.org/books/USAP-Official-Rulebook/' },
  { label: 'Rules updates and equipment manual', href: 'https://usapickleball.org/rules/' },
];
const NOTE = 'Opens in your browser and needs internet.';

/** URLs listed in docs/RULES_SOURCES.md (the "- label: URL" bullets at the top). */
function urlsInRulesSources(): string[] {
  const md = readFileSync(join(REPO, 'docs/RULES_SOURCES.md'), 'utf8');
  return [...md.matchAll(/^- [^:\n]+:\s*(https?:\/\/\S+)\s*$/gm)].map((m) => m[1]);
}

const link = (page: Page, href: string) => page.locator(`a[href="${href}"]`);
const readyTheSw = async (page: Page) => {
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r && !!r.active && r.active.state === 'activated' && !!navigator.serviceWorker.controller;
  }, undefined, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(async () => {
    let n = 0;
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/\.woff2(\?|$)/.test(r.url)) n++;
    return n;
  }), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
};

test.describe('Invariant 1: both links on Setup with exact URLs, target and rel', () => {
  test('RULES_SOURCES.md lists exactly the two URLs the spec names', () => {
    const listed = urlsInRulesSources();
    expect(listed.length, 'parsed some URLs from docs/RULES_SOURCES.md').toBeGreaterThanOrEqual(2);
    expect(listed).toEqual(SPEC_LINKS.map((l) => l.href));
  });

  test('Setup shows an anchor per URL from RULES_SOURCES.md, labelled as in the spec, with target and rel', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await tab(page, 'setup');
      for (const [i, expected] of urlsInRulesSources().entries()) {
        const a = link(page, expected);
        await expect(a, `link to ${expected}`).toHaveCount(1);
        await expect(a).toBeVisible();
        expect(await a.evaluate((e) => e.tagName)).toBe('A');
        await expect(a).toHaveAttribute('href', expected);
        await expect(a).toHaveAttribute('target', '_blank');
        const rel = ((await a.getAttribute('rel')) ?? '').toLowerCase().split(/\s+/);
        expect(rel).toContain('noopener');
        expect(rel).toContain('noreferrer');
        expect((await a.innerText()).trim()).toBe(SPEC_LINKS[i].label);
      }
      // "taken from RULES_SOURCES.md and no others": no other external link anywhere on the page
      const external = await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!).filter((h) => /^(https?:)?\/\//i.test(h)));
      expect(external.sort()).toEqual(urlsInRulesSources().sort());
    } finally { await ctx.close(); }
  });

  test('Invariant 1 (behaviour): links are plain anchors, one per row, with the note line under them', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      const boxes = [];
      for (const l of SPEC_LINKS) {
        const a = link(page, l.href);
        expect(await a.evaluate((e) => e.tagName)).toBe('A');
        expect(await a.evaluate((e) => !!e.closest('button'))).toBe(false);
        boxes.push((await a.boundingBox())!);
      }
      // one per row: the second starts below the first ends, and they do not share a row
      expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height - 1);
      const note = page.getByText(NOTE, { exact: true });
      await expect(note).toHaveCount(1);
      const nb = (await note.boundingBox())!;
      expect(nb.y, 'note is under the links').toBeGreaterThanOrEqual(boxes[1].y + boxes[1].height - 1);
      // the existing hint citing Rule 15.C stays
      expect(await page.locator('body').innerText()).toContain('(Rule 15.C)');
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 2: no request to any host except the app origin', () => {
  test('Invariant 2: setup (card visible), schedule and scoring request only the own origin; no hints to the rules sites', async ({ browser }) => {
    test.setTimeout(120_000);
    const base = process.env.APP_BASE_URL!;
    const origin = new URL(base).origin;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
    const seen: string[] = [];
    ctx.on('request', (r: Request) => { if (!/^(data|blob|about):/.test(r.url())) seen.push(r.url()); });
    const page = await ctx.newPage();
    try {
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForSelector('#nav button');
      await expect(link(page, SPEC_LINKS[0].href)).toBeVisible();
      await expect(link(page, SPEC_LINKS[1].href)).toBeVisible();
      await readyTheSw(page);
      await generate(page, { n: 4, m: 1, to: 11 });
      await tab(page, 'matches');
      expect((await enter(page, 'm0', 11, 4)).rejected).toBe(false);
      await tab(page, 'board');
      await tab(page, 'setup');
      await expect(link(page, SPEC_LINKS[0].href)).toBeVisible();
      await page.waitForTimeout(500);
      // no prefetch / preconnect / dns-prefetch / preload hints to those sites in the DOM
      const hints = await page.$$eval('link[rel]', (ls) => ls.map((l) => `${l.getAttribute('rel')} ${l.getAttribute('href')}`));
      expect(hints.filter((h) => /usapickleball/i.test(h))).toEqual([]);
      expect(seen.length).toBeGreaterThan(5);
      expect(seen.filter((u) => new URL(u).origin !== origin), 'foreign requests').toEqual([]);
      expect(seen.filter((u) => /usapickleball/i.test(u))).toEqual([]);
      // the service worker must not have cached the rules sites
      const cached = await page.evaluate(async () => {
        const out: string[] = [];
        for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url);
        return out;
      });
      expect(cached.filter((u) => /usapickleball/i.test(u))).toEqual([]);
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 3: offline, the page loads and shows the card', () => {
  test('Invariant 3: after the SW is active, an offline reload still shows both links and the note', async ({ browser }) => {
    test.setTimeout(120_000);
    const base = process.env.APP_BASE_URL!;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
    const page = await ctx.newPage();
    try {
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForSelector('#nav button');
      await readyTheSw(page);
      await ctx.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#nav button');
      await tab(page, 'setup');
      for (const l of SPEC_LINKS) {
        await expect(link(page, l.href)).toBeVisible();
        await expect(link(page, l.href)).toHaveText(l.label);
      }
      await expect(page.getByText(NOTE, { exact: true })).toBeVisible();
      // the app still works offline as before
      await generate(page, { n: 4, m: 1, to: 11 });
      await expect(page.locator('.mcard')).toHaveCount(1);
      await ctx.setOffline(false);
    } finally { await ctx.close(); }
  });
});

test.describe('Invariant 4: 360px layout', () => {
  test('Invariant 4: no horizontal scroll and every link is at least 44px tall (empty setup and with a long player list)', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      for (const filled of [false, true]) {
        if (filled) await page.fill('#players', Array.from({ length: 12 }, (_, i) => `A fairly long player name number ${i + 1}`).join('\n'));
        await link(page, SPEC_LINKS[1].href).scrollIntoViewIfNeeded();
        const m = await page.evaluate(() => ({
          vw: window.innerWidth,
          docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth,
          bodySW: document.body.scrollWidth, scrollX: (window.scrollTo(50, 0), window.scrollX),
        }));
        expect(m.vw).toBe(360);
        expect(m.docSW, 'documentElement scrollWidth').toBeLessThanOrEqual(m.docCW);
        expect(m.bodySW, 'body scrollWidth').toBeLessThanOrEqual(m.docCW);
        expect(m.scrollX, 'page cannot be scrolled sideways').toBe(0);
        for (const l of SPEC_LINKS) {
          const b = (await link(page, l.href).boundingBox())!;
          expect(b.height, `${l.label} height`).toBeGreaterThanOrEqual(44);
          expect(b.x, `${l.label} left edge`).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width, `${l.label} right edge`).toBeLessThanOrEqual(360);
        }
        const nb = (await page.getByText(NOTE, { exact: true }).boundingBox())!;
        expect(nb.x + nb.width).toBeLessThanOrEqual(360);
      }
    } finally { await ctx.close(); }
  });
});

function walk(p: string): string[] {
  return statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p];
}
/** Text runs the way the baseline fixture was produced: quotes, backticks, angle brackets and \n split the text. */
function runsOf(text: string): string[] {
  return text.replace(/<style[\s\S]*?<\/style>/g, '').split(/["'`<>\n]|\\n/).map((s) => s.trim()).filter((s) => s.length >= 40 && /\s/.test(s));
}

test.describe('Invariant 5: no rulebook content is bundled', () => {
  test('Invariant 5: dist contains no PDF (by name or by %PDF magic bytes)', () => {
    const files = walk(DIST);
    expect(files.length).toBeGreaterThan(5);
    expect(files.filter((f) => /\.pdf$/i.test(f))).toEqual([]);
    const magic = files.filter((f) => readFileSync(f).subarray(0, 1024).includes('%PDF-'));
    expect(magic).toEqual([]);
  });

  test('Invariant 5: no new prose beyond the card itself compared with main (baseline fixture)', () => {
    const text = ['index.html', 'assets/main.js'].map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n');
    const base = new Set(BASELINE.textRuns);
    expect(base.size, 'baseline fixture loaded').toBeGreaterThan(50);
    // Runs containing { } ; or => are CSS/JS code, not prose (new card styling is allowed).
    const added = [...new Set(runsOf(text))].filter((r) => !base.has(r) && !/[{};]|=>/.test(r));
    // The only prose the card may add: its note line (labels are shorter than 40 chars or contain no prose).
    const unexplained = added.filter((r) => r !== NOTE);
    expect(unexplained, 'new text runs of 40+ characters that are not the card note').toEqual([]);
    // each text run that was in main is still unchanged (the Rule 15.C hint stays as it is)
    expect(text).toContain('Golden point is a house rule. Official USA Pickleball scoring is win by 2 (Rule 15.C).');
    // the Rule citations are not multiplied: only the pre-existing hint cites a rule number
    expect((text.match(/Rule \d+\.[A-Z]/g) ?? []).length).toBe(1);
  });

  test('Invariant 5: rulebook sources appear in dist only as the two spec URLs', () => {
    const text = ['index.html', 'assets/main.js', 'assets/index.css'].map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n');
    const urls = new Set((text.match(/https?:\/\/[^\s"'`<>)\\]+/g) ?? []));
    const rules = [...urls].filter((u) => /usapickleball/i.test(u));
    expect(rules.sort()).toEqual(SPEC_LINKS.map((l) => l.href).sort());
    // precache / service worker do not list them
    expect(readFileSync(join(DIST, 'sw.js'), 'utf8')).not.toMatch(/usapickleball/i);
  });
});

test.describe('Must not change: sw.js, manifest, icons, cache name, localStorage keys', () => {
  test('public files are byte-identical to main (sha256 baseline) and dist copies match', () => {
    for (const [f, sha] of Object.entries(BASELINE.publicSha256)) {
      const p = join(PUB, f);
      expect(existsSync(p), f).toBe(true);
      expect(createHash('sha256').update(readFileSync(p)).digest('hex'), `public/${f} changed`).toBe(sha);
    }
    for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
      expect(readFileSync(join(DIST, f)).equals(readFileSync(join(PUB, f))), `dist/${f} differs from public/${f}`).toBe(true);
    }
  });

  test('cache name scheme is unchanged', () => {
    const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
    expect(sw.match(/net-picking-v\d+/)?.[0]).toBe(BASELINE.cacheName);
  });

  test('no new localStorage keys across setup, schedule and scoring', async ({ browser }) => {
    const { ctx, page } = await openApp(browser);
    try {
      await generate(page, { n: 4, m: 1, to: 11 });
      await tab(page, 'matches');
      await enter(page, 'm0', 11, 4);
      await tab(page, 'setup');
      const keys = await page.evaluate(() => Object.keys(localStorage));
      expect(keys.filter((k) => ![TOUR_KEY, PREFS_KEY].includes(k))).toEqual([]);
      expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    } finally { await ctx.close(); }
  });
});
