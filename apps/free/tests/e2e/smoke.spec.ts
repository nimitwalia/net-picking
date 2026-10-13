// 360px smoke test of the built preview, served from a sub-path.
// Expected behaviour comes from AGENTS.md: m valid iff N*m % 4 === 0 and m <= N-1 (no byes);
// scores must follow win-by-2 against points-to-play; finals unlock after all matches.
import { expect, test, type Page } from '@playwright/test';

const PLAYERS = ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha'];
const N = PLAYERS.length;
const M = 4; // only valid m for N=5: 5*4=20 divisible by 4, 4 <= 4. (m=1,2,3 give 5,10,15: not divisible.)
const TOTAL = (N * M) / 4; // 5 matches

async function noOverflow(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `horizontal overflow at 360px on ${where}`).toBeLessThanOrEqual(360);
}

async function save(page: Page, id: string, a: number, b: number) {
  await page.fill(`#${id}a`, String(a));
  await page.fill(`#${id}b`, String(b));
  await page.click(`button[data-act="saveScore"][data-id="${id}"]`);
}

for (const TO of [7, 11, 15, 21]) {
  test(`full tournament flow at 360px, play to ${TO}`, async ({ page }) => {
    const base = process.env.PREVIEW_BASE_URL!;
    expect(base).toContain('/net-picking/next/');
    await page.goto(base);

    // PREVIEW badge and sub-path service worker scope.
    await expect(page.getByText('PREVIEW', { exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Net-picking Next');
    await noOverflow(page, 'setup (empty)');

    // Setup: players, points to play.
    await page.fill('#players', PLAYERS.join('\n'));
    await expect(page.locator('#setupInfo')).toContainText('5 players');
    await page.click(`[data-ns="cfg"] button[data-k="to"][data-v="${TO}"]`);
    // New tournaments default to golden point; this test checks win by 2, so select it explicitly.
    await page.click('[data-ns="cfg"] button[data-k="tie"][data-v="win2"]');
    await noOverflow(page, 'setup (players entered)');

    // Valid matches-per-player options for N=5 are exactly {4}.
    const opts = await page.locator('#mSel option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(opts).toEqual([String(M)]);
    await page.selectOption('#mSel', String(M));
    await page.click('button[data-act="generate"]');

    // Schedule: TOTAL matches, nothing saved, finals locked.
    await expect(page.locator('.mcard')).toHaveCount(TOTAL);
    await expect(page.locator('.rchip')).toContainText(`to ${TO}`);
    await noOverflow(page, 'schedule after generation');
    await page.click('button[data-act="tab"][data-tab="finals"]').catch(() => {});
    await expect(page.locator('button[data-act="startFinals"]')).toHaveCount(0);

    await page.click('#nav button[data-tab="matches"]');
    // Rejected scores against win-by-2: tie, below target, target without 2 lead, overtime without 2 lead.
    const bad: Array<[number, number]> = [[TO, TO], [TO - 1, 0], [TO, TO - 1], [TO + 1, TO]];
    for (const [a, b] of bad) {
      await save(page, 'm0', a, b);
      await expect(page.locator('#m0err'), `${a}-${b} should be rejected`).toBeVisible();
      await expect(page.locator('.mcard').first().locator('.pill')).not.toHaveText('Saved');
    }
    // Overtime lead of more than 2 is also not a reachable final score.
    await save(page, 'm0', TO + 5, TO - 1);
    await expect(page.locator('#m0err')).toBeVisible();

    // Valid scores: deuce finish (TO+1 vs TO-1) for match 0, TO-0 / win-by-2 variants for the rest.
    await noOverflow(page, 'scoring view with validation errors');
    await save(page, 'm0', TO + 2, TO);
    await expect(page.locator('.mcard').first().locator('.pill')).toHaveText('Saved');
    await expect(page.locator('.mcard').first()).toContainText('+3');
    await expect(page.locator('.mcard').first()).toContainText('−1');
    for (let i = 1; i < TOTAL; i++) {
      await save(page, `m${i}`, i % 2 ? TO : 3, i % 2 ? TO - 2 : TO);
      await expect(page.locator('.mcard').nth(i).locator('.pill')).toHaveText('Saved');
    }

    // Finals unlock.
    await page.click('#nav button[data-tab="finals"]');
    await expect(page.locator('button[data-act="startFinals"]')).toBeVisible();
    await noOverflow(page, 'finals (unlocked)');
    await page.click('button[data-act="startFinals"]');

    // Final: invalid rejected, valid gives a winner.
    await save(page, 'f', TO - 1, TO - 1);
    await expect(page.locator('#ferr')).toBeVisible();
    await save(page, 'f', TO, TO - 2);
    await expect(page.locator('.champ')).toBeVisible();
    await expect(page.locator('.champ')).toContainText('Champions');
    await expect(page.locator('.champ .sc')).toHaveText(`${TO} – ${TO - 2}`);
    await noOverflow(page, 'finals (champions)');
    await expect(page).toHaveTitle('Net-picking Next');

    // Storage isolation.
    const st = await page.evaluate(() => ({
      live: localStorage.getItem('pickleball_tournament_v1'),
      next: localStorage.getItem('pickleball_tournament_next_v1'),
    }));
    expect(st.live).toBeNull();
    expect(st.next).not.toBeNull();

    // Service worker scope is inside the sub-path (and exactly the app directory).
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r));
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.scope);
    expect(scope).toBe(base);
    expect(new URL(scope).pathname.startsWith('/net-picking/next/')).toBe(true);
    const caches = await page.evaluate(() => globalThis.caches.keys());
    expect(caches).not.toContain('net-picking-v1');
  });
}
