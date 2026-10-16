// Structure rules, stage S1 and later. Expected rules come from the 4c brief, not from the implementation.
// (The Math.random / Date.now injection-site rule is in structure-s2.test.ts, because before S2 the
// scheduler code still lives in main.js and legitimately uses both.)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blankLiterals, indexPath, parseImports, readMain, root, stripComments } from './src-helpers';

const html = readFileSync(indexPath, 'utf8');
const rootHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
const MODULE_TAG = '<script type="module" src="./src/main.js"></script>';

describe('S1: module entry', () => {
  it('index.html has the module script tag and no inline classic script remains', () => {
    expect(html.split(MODULE_TAG).length - 1, 'exactly one module tag').toBe(1);
    expect(html.split('<script').length - 1, 'no other script element at all').toBe(1);
    expect(/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'no inline script').toBe(false);
  });
  it('the module tag is where the inline script was in the root file (end of body)', () => {
    expect(rootHtml).toMatch(/<\/script>\s*<\/body>/);
    expect(html).toMatch(/<script type="module" src="\.\/src\/main\.js"><\/script>\s*<\/body>/);
    // same prefix before the script: everything before it is the root's prefix (modulo the d/e changes already
    // asserted in preview-parity.test.ts), so just check the nodes that precede it are the same.
    const before = (h: string, mark: string) => h.slice(0, h.indexOf(mark)).match(/<(main|nav|header|div id="view")[ >]/g);
    expect(before(html, '<script')).toEqual(before(rootHtml, '<script'));
  });
  it('src/main.js exists and is a non-trivial module', () => {
    expect(readMain().length).toBeGreaterThan(1000);
  });
});

describe('(c) storage key isolation', () => {
  it('main.js uses the preview key and never the live key', () => {
    const main = readMain();
    expect(main).toMatch(/const KEY='pickleball_tournament_next_v1';/);
    expect(main).not.toContain('pickleball_tournament_v1');
    expect(html).not.toContain('pickleball_tournament_v1');
    const keys = [...stripComments(main).matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)].map((m) => m[1].trim());
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(['KEY', 'PREFS_KEY'], 'only the KEY and PREFS_KEY constants are used for storage').toContain(k);
  });
});

describe('(d) imports and network', () => {
  const main = readMain();
  const nc = stripComments(main);
  it('main.js imports only from @net-picking/core and relative paths', () => {
    const { specs } = parseImports(nc);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs).toContain('@net-picking/core');
    for (const s of specs) expect(s === '@net-picking/core' || /^\.{1,2}\//.test(s), `import ${s}`).toBe(true);
    expect(/\brequire\s*\(/.test(nc)).toBe(false);
  });
  it('no new network URLs or network APIs in main.js or index.html (only the pre-existing Google Fonts link)', () => {
    const urls = (s: string) => new Set([...s.matchAll(/https?:\/\/[^\s"'<>)`]+/g)].map((m) => m[0]));
    const allowed = urls(rootHtml);
    for (const u of [...urls(html), ...urls(main)]) expect(allowed.has(u), `new URL ${u}`).toBe(true);
    const code = blankLiterals(nc);
    for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon']) {
      expect(new RegExp(`(?<![\\w$])${api}(?![\\w$])`).test(code), `${api} must not appear in main.js`).toBe(false);
    }
  });
  it('html: no external src/href at all (everything is served from the app origin)', () => {
    const ext = [...html.matchAll(/\b(?:src|href)\s*=\s*["']?((?:https?:)?\/\/[^"'\s>]+)/gi)].map((m) => m[1]);
    expect(ext).toEqual([]);
    expect(html).not.toMatch(/googleapis|gstatic/i);
  });
});
