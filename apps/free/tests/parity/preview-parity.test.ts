// Parity tests: apps/free is a PREVIEW copy of the live root app. Only the owner-approved changes
// (a key, b sw registration, c manifest, d badge, e title/apple title, f sw cache prefix) may differ.
// Anything else (drift) must fail here.
//
// Item 4c: the <script> body is no longer byte-compared (the logic moves to src/main.js, which is
// covered by tests/parity/structure*.test.ts and the e2e golden master). Everything OUTSIDE the script
// block is still compared byte for byte, and the script block must sit in the same position: the root's
// inline <script>...</script> is replaced in the preview either by itself (before S1) or by exactly one
// <script type="module" src="./src/main.js"></script> tag.
//
// Strictness choice: the expected transform is written below from the roadmap/brief, not from a diff.
// Comments that mark a change must contain the word PREVIEW, but their exact wording and
// whitespace are NOT asserted (only that a marker exists next to each change). Everything else is
// compared byte for byte.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../..');
const free = resolve(import.meta.dirname, '../..');
const rd = (p: string) => readFileSync(p, 'utf8');
const rdb = (p: string) => readFileSync(p);

const LIVE_KEY = 'pickleball_tournament_v1';
const NEXT_KEY = 'pickleball_tournament_next_v1';

const SCRIPT_RE = /<script>[\s\S]*?<\/script>/;
const MODULE_TAG = '<script type="module" src="./src/main.js"></script>';
const PLACEHOLDER = '<!--SCRIPT-BLOCK-->';
/** Replace the single script block (inline, or the module tag) by a placeholder so position is compared. */
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
/** The preview's script source: inline body, or src/main.js when the module tag is used. */
function previewScript(html: string): string {
  const inl = html.match(SCRIPT_RE);
  return inl ? inl[0] : rd(resolve(free, 'src/main.js'));
}

function once(haystack: string, needle: string): void {
  expect(haystack.split(needle).length - 1, `expected exactly one: ${needle}`).toBe(1);
}

/** Remove the markers the preview adds, so the remainder can be compared exactly. Returns count removed. */
function stripMarkers(html: string): { out: string; badge: number; jsComments: string[]; htmlComments: number } {
  let badge = 0;
  let htmlComments = 0;
  const jsComments: string[] = [];
  let out = html;
  // d) the badge: one fixed-position element whose text is PREVIEW, optionally followed by an HTML comment.
  out = out.replace(/<div[^>]*position:\s*fixed[^>]*>\s*PREVIEW\s*<\/div>(<!--[^>]*PREVIEW[^>]*-->)?\r?\n?/g, () => {
    badge++;
    return '';
  });
  out = out.replace(/^[ \t]*<!--[^>]*PREVIEW[^>]*-->[ \t]*\r?\n/gm, () => {
    htmlComments++;
    return '';
  });
  // JS line comments that carry the PREVIEW marker, on their own line.
  out = out.replace(/^[ \t]*\/\/[^\n]*PREVIEW[^\n]*\r?\n/gm, (m) => {
    jsComments.push(m);
    return '';
  });
  return { out, badge, jsComments, htmlComments };
}

describe('index.html parity (root vs apps/free), outside the script block', () => {
  const live = rd(resolve(root, 'index.html'));
  const preview = rd(resolve(free, 'index.html'));

  const regOld = "navigator.serviceWorker.register('sw.js')";
  const regNew = "navigator.serviceWorker.register('sw.js',{scope:'./'})";
  const TITLE = 'Net-picking Next';
  once(live, `const KEY='${LIVE_KEY}';`);
  once(live, regOld);
  once(live, '<meta name="apple-mobile-web-app-title" content="Net-picking">');
  once(live, '<title>Net-picking</title>');
  // Expected transform for the HTML/CSS outside the script: e) title and apple title only
  // (d, the badge, and the marker comments are stripped before comparing). a) key and b) sw registration
  // live inside the script and are checked separately below.
  const expected = maskScript(live)
    .replace('<meta name="apple-mobile-web-app-title" content="Net-picking">', `<meta name="apple-mobile-web-app-title" content="${TITLE}">`)
    .replace('<title>Net-picking</title>', `<title>${TITLE}</title>`);

  it('live file carries no PREVIEW text (so marker stripping cannot hide live content)', () => {
    expect(live).not.toContain('PREVIEW');
  });

  it('outside the script block equals root with only changes d) e) applied; script sits at the same position', () => {
    const { out, badge, htmlComments } = stripMarkers(maskScript(preview));
    expect(badge, 'exactly one PREVIEW badge').toBe(1);
    expect(htmlComments, 'one PREVIEW comment each for apple title and title').toBe(2);
    expect(out === expected, 'apps/free/index.html drifted from root beyond the allowed changes').toBe(true);
  });

  it('the script is either the original inline block or the single module tag (no other script elements)', () => {
    const inl = SCRIPT_RE.test(preview);
    const mod = preview.includes(MODULE_TAG);
    expect(inl !== mod, 'exactly one of inline script / module tag').toBe(true);
    expect(preview.split('<script').length - 1).toBe(1);
  });

  it('every html change is directly preceded by a PREVIEW comment line', () => {
    const lines = preview.split('\n');
    const prev = (needle: string) => {
      const i = lines.findIndex((l) => l.includes(needle));
      expect(i, needle).toBeGreaterThan(0);
      return lines[i - 1];
    };
    expect(prev(`<title>${TITLE}</title>`)).toMatch(/^\s*<!--.*PREVIEW.*-->\s*$/);
    expect(prev(`content="${TITLE}"`)).toMatch(/^\s*<!--.*PREVIEW.*-->\s*$/);
    expect(preview).toMatch(/position:\s*fixed[^>]*>\s*PREVIEW\s*<\/div>/);
  });

  it('title and apple-mobile-web-app-title are both "Net-picking Next"', () => {
    expect(preview).toMatch(/<title>Net-picking Next<\/title>/);
    expect(preview).toMatch(/<meta name="apple-mobile-web-app-title" content="Net-picking Next">/);
  });
});

describe('script-level preview changes (wherever the script lives: inline or src/main.js)', () => {
  const live = rd(resolve(root, 'index.html'));
  const preview = rd(resolve(free, 'index.html'));
  const script = previewScript(preview);
  const regNew = "navigator.serviceWorker.register('sw.js',{scope:'./'})";

  it('preview KEY is extracted and differs from live KEY', () => {
    const keyOf = (h: string) => h.match(/const KEY='([^']+)';/)?.[1];
    expect(keyOf(live)).toBe(LIVE_KEY);
    expect(keyOf(script)).toBe(NEXT_KEY);
    expect(script).not.toContain(`'${LIVE_KEY}'`);
  });

  it("SW registration is exactly register('sw.js',{scope:'./'})", () => {
    expect(script.split(regNew).length - 1).toBe(1);
    expect(script).not.toContain("navigator.serviceWorker.register('sw.js')");
    expect(script).toMatch(/location\.protocol\.indexOf\('http'\)===0/);
  });

  it('key and registration changes carry a PREVIEW comment line', () => {
    const lines = script.split('\n');
    const prev = (needle: string) => {
      const i = lines.findIndex((l) => l.includes(needle));
      expect(i, needle).toBeGreaterThan(0);
      return lines[i - 1];
    };
    expect(prev(`const KEY='${NEXT_KEY}'`)).toMatch(/^\s*\/\/.*PREVIEW/);
    expect(prev(regNew)).toMatch(/^\s*\/\/.*PREVIEW/);
  });
});

describe('sw.js parity', () => {
  const live = rd(resolve(root, 'sw.js'));
  const preview = rd(resolve(free, 'public/sw.js'));
  const oldC = "const C='net-picking-v1';";
  const oldF = 'ks.filter(k=>k!==C)';
  once(live, oldC);
  once(live, oldF);
  it('equals root sw.js except prefix-built cache name and prefix-only deletion (comment lines ignored)', () => {
    // S5 (offline): cache version may be v1 or v2 and FILES may additionally list the entry .js file;
    // those two differences are normalised away here and asserted in sw-s5.test.ts instead.
    const stripped = preview
      .replace(/^[ \t]*\/\/[^\n]*PREVIEW[^\n]*\r?\n/gm, '')
      .replace("const C=P+'v2';", "const C=P+'v1';")
      .replace(/,'[^']*\.js'(?=[,\]])/g, '');
    expect(preview).toMatch(/^\/\/.*PREVIEW/);
    const expected = live
      .replace(oldC, "const P='net-picking-next-';const C=P+'v1';")
      .replace(oldF, 'ks.filter(k=>k.startsWith(P)&&k!==C)');
    expect(stripped).toBe(expected);
  });
  it('deletes only prefixed caches, never every cache != current', () => {
    expect(preview).not.toContain('ks.filter(k=>k!==C)');
    expect(preview).toContain('k.startsWith(P)');
  });
});

describe('manifest parity', () => {
  const live = JSON.parse(rd(resolve(root, 'manifest.webmanifest')));
  const preview = JSON.parse(rd(resolve(free, 'public/manifest.webmanifest')));
  it('equals root manifest except name, short_name, start_url, scope', () => {
    expect(preview).toEqual({ ...live, name: 'Net-picking Next', short_name: 'Net-picking Next', start_url: './', scope: './' });
  });
  it('has the required preview values and a distinct name', () => {
    expect(preview.name).toBe('Net-picking Next');
    expect(preview.short_name).toBe('Net-picking Next');
    expect(preview.start_url).toBe('./');
    expect(preview.scope).toBe('./');
    expect(preview.name).not.toBe(live.name);
  });
  it('icon entries are unchanged (same filenames)', () => {
    expect(preview.icons).toEqual(live.icons);
  });
});

describe('icons', () => {
  for (const f of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
    it(`${f} is byte-identical to root`, () => {
      expect(rdb(resolve(free, 'public', f)).equals(rdb(resolve(root, f)))).toBe(true);
    });
  }
});
