// Parity tests after the 4d cutover: apps/free is now the LIVE app. It must stay identical to the old app
// (the fixture copy of tag legacy-final in tests/fixtures/legacy) except for the owner-approved changes:
//   - the inline script moved to src/main.js (a single module tag at the same position),
//   - the three Google Fonts <link> lines replaced by one local stylesheet link (self-hosted fonts),
//   - new code in the script (tie rule, core wiring), covered by the structure and e2e tests.
// Preview identity (PREVIEW badge, "Net-picking Next" title, _next_ keys, net-picking-next- cache) must be gone.
// The manifest and icons must be identical to the old ones so an installed home-screen app keeps working.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const free = resolve(import.meta.dirname, '../..');
const legacy = resolve(free, 'tests/fixtures/legacy');
const rd = (p: string) => readFileSync(p, 'utf8');
const rdb = (p: string) => readFileSync(p);

const LIVE_KEY = 'pickleball_tournament_v1';

const SCRIPT_RE = /<script>[\s\S]*?<\/script>/;
const MODULE_TAG = '<script type="module" src="./src/main.js"></script>';
const PLACEHOLDER = '<!--SCRIPT-BLOCK-->';
function maskScript(html: string): string {
  const inl = html.match(SCRIPT_RE);
  if (inl) {
    expect(html.split('<script').length - 1, 'exactly one script element').toBe(1);
    return html.replace(SCRIPT_RE, PLACEHOLDER);
  }
  expect(html.split(MODULE_TAG).length - 1, 'exactly one module script tag').toBe(1);
  expect(html.split('<script').length - 1, 'exactly one script element').toBe(1);
  return html.replace(MODULE_TAG, PLACEHOLDER);
}

function once(haystack: string, needle: string): void {
  expect(haystack.split(needle).length - 1, `expected exactly one: ${needle}`).toBe(1);
}

const GOOGLE_LINES =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">\n';
const LOCAL_FONTS_LINK = '<link rel="stylesheet" href="./src/fonts.css">';

describe('index.html parity (legacy fixture vs apps/free), outside the script block', () => {
  const old = rd(resolve(legacy, 'index.html'));
  const now = rd(resolve(free, 'index.html'));
  it('sanity: the legacy fixture is the old app (title Net-picking, live key, Google Fonts lines)', () => {
    once(old, '<title>Net-picking</title>');
    once(old, '<meta name="apple-mobile-web-app-title" content="Net-picking">');
    once(old, `const KEY='${LIVE_KEY}';`);
    once(old, GOOGLE_LINES);
    expect(old).not.toContain('PREVIEW');
  });
  it('outside the script block equals the old file with only the font links swapped; script at the same position', () => {
    const expected = maskScript(old).replace(GOOGLE_LINES, LOCAL_FONTS_LINK + '\n');
    expect(maskScript(now) === expected, 'apps/free/index.html drifted from the old app beyond the allowed changes').toBe(true);
  });
  it('title and apple-mobile-web-app-title are "Net-picking"; no PREVIEW text, badge or marker comment anywhere', () => {
    expect(now).toMatch(/<title>Net-picking<\/title>/);
    expect(now).toMatch(/<meta name="apple-mobile-web-app-title" content="Net-picking">/);
    expect(now).not.toContain('PREVIEW');
    expect(now).not.toContain('Net-picking Next');
  });
});

describe('script-level identity (src/main.js)', () => {
  // Read through the module tag in index.html, not a hard-coded layout beyond that tag.
  const script = rd(resolve(free, 'src/main.js'));
  it('uses the live tournament key and the live prefs key; no _next_ key', () => {
    expect(script).toMatch(new RegExp(`const KEY='${LIVE_KEY}';`));
    expect(script).toContain('pickleball_prefs_v1');
    expect(script).not.toMatch(/_next_/);
  });
  it('registers sw.js at the site-root scope, only on http(s)', () => {
    expect(script).toMatch(/navigator\.serviceWorker\.register\('sw\.js'(,\{scope:'\.\/'\})?\)/);
    expect(script).toMatch(/location\.protocol\.indexOf\('http'\)===0/);
  });
  it('carries no PREVIEW marker comments or text', () => {
    expect(script).not.toContain('PREVIEW');
    expect(script).not.toContain('Net-picking Next');
  });
});

describe('sw.js identity (behaviour is tested in sw-behaviour.test.ts and sw-s5.test.ts)', () => {
  const sw = rd(resolve(free, 'public/sw.js'));
  it('no longer uses the old app cache as its own, and does not delete everything but the current cache', () => {
    expect(sw).not.toContain('ks.filter(k=>k!==C)');
    expect(sw).not.toMatch(/const C='net-picking-v1'/);
    expect(sw).not.toContain('PREVIEW');
  });
});

describe('manifest parity', () => {
  const old = JSON.parse(rd(resolve(legacy, 'manifest.webmanifest')));
  const now = JSON.parse(rd(resolve(free, 'public/manifest.webmanifest')));
  it('is identical in content to the old manifest (so installed home-screen apps keep working)', () => {
    expect(now).toEqual(old);
  });
  it('has the live identity: name/short_name Net-picking, start_url ./, scope ./, no id, same icons', () => {
    expect(now.name).toBe('Net-picking');
    expect(now.short_name).toBe('Net-picking');
    expect(now.start_url).toBe('./');
    expect(now.scope).toBe('./');
    expect('id' in now).toBe(false);
    expect(now.icons).toEqual(old.icons);
  });
});

describe('icons', () => {
  for (const f of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
    it(`${f} is byte-identical to the old app's`, () => {
      expect(rdb(resolve(free, 'public', f)).equals(rdb(resolve(legacy, f)))).toBe(true);
    });
  }
});
