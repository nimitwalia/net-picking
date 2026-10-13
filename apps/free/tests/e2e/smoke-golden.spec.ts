// 360px smoke test of a full tournament under the default tie rule (golden point), including the finals with
// "10-11 style" scores. Expected behaviour from docs/specs/tie-rule.md and AGENTS.md (no byes: N*m % 4 === 0).
import { expect, test, type Page } from '@playwright/test';

const PLAYERS = ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha'];
const M = 4;
const TOTAL = (PLAYERS.length * M) / 4;

async function noOverflow(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), `horizontal overflow at 360px on ${where}`).toBeLessThanOrEqual(360);
}
async function save(page: Page, id: string, a: number, b: number) {
  await page.fill(`#${id}a`, String(a));
  await page.fill(`#${id}b`, String(b));
  await page.click(`button[data-act="saveScore"][data-id="${id}"]`);
}

for (const TO of [7, 11, 15, 21]) {
  test(`golden full tournament flow at 360px, play to ${TO}`, async ({ page }) => {
    await page.goto(process.env.PREVIEW_BASE_URL!);
    await page.waitForSelector('#nav button');
    await expect(page.locator('[data-ns="cfg"] button[data-k="tie"][data-v="golden"]')).toHaveClass(/\bon\b/);
    await noOverflow(page, 'setup (empty, golden default)');
    await page.fill('#players', PLAYERS.join('\n'));
    await page.click(`[data-ns="cfg"] button[data-k="to"][data-v="${TO}"]`);
    await noOverflow(page, 'setup (players entered)');
    expect(await page.locator('#mSel option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).toEqual([String(M)]);
    await page.click('button[data-act="generate"]');
    await expect(page.locator('.mcard')).toHaveCount(TOTAL);
    await expect(page.locator('.rhint').first()).toContainText(/golden/i);
    await noOverflow(page, 'schedule');
    await page.click('#nav button[data-tab="matches"]');
    for (const [a, b] of [[TO - 1, TO - 1], [TO + 1, TO - 1], [TO - 2, TO - 3], [TO, TO], [TO - 1, 0]]) {
      await save(page, 'm0', a, b);
      await expect(page.locator('#m0err'), `${a}-${b} rejected`).toBeVisible();
      await expect(page.locator('.mcard').first().locator('.pill')).not.toHaveText('Saved');
    }
    await noOverflow(page, 'scoring view with a golden error');
    await save(page, 'm0', TO - 1, TO);
    await expect(page.locator('.mcard').first().locator('.pill')).toHaveText('Saved');
    await expect(page.locator('.mcard').first()).toContainText('+3');
    await expect(page.locator('.mcard').first()).toContainText('−1');
    for (let i = 1; i < TOTAL; i++) {
      await save(page, `m${i}`, i % 2 ? TO : TO - 1, i % 2 ? TO - 1 : TO);
      await expect(page.locator('.mcard').nth(i).locator('.pill')).toHaveText('Saved');
    }
    await page.click('#nav button[data-tab="finals"]');
    await noOverflow(page, 'finals (unlocked, scoring card)');
    await page.click('button[data-act="startFinals"]');
    await save(page, 'f', TO - 1, TO - 1);
    await expect(page.locator('#ferr')).toBeVisible();
    await save(page, 'f', TO + 1, TO - 1);
    await expect(page.locator('#ferr')).toBeVisible();
    await save(page, 'f', TO - 1, TO);
    await expect(page.locator('.champ')).toBeVisible();
    await expect(page.locator('.champ .sc')).toHaveText(`${TO} – ${TO - 1}`);
    await noOverflow(page, 'finals (champions)');
    await page.click('#nav button[data-tab="board"]');
    await noOverflow(page, 'board');
  });
}
