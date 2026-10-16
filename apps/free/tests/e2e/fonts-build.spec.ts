// Self-host fonts: static checks on the build output and sources (no browser needed).
//  (c) every dist .woff2 is in the SW precache list; latin subset only; no googleapis/gstatic anywhere
//  (d) SW cache prefix rule and bumped cache version
import { expect, test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const free = resolve(import.meta.dirname, '../..');
const dist = join(free, 'dist');
// ADJUST HERE if the builder puts the precache list elsewhere (file under dist containing the list).
const PRECACHE_ARTIFACT = 'sw.js';
const SW_FILE = 'sw.js';
// Format (builder): `const ASSETS=/*PRECACHE_START*/["assets/x.woff2",...]/*PRECACHE_END*/;` in dist/sw.js.
function precacheList(): string[] {
  const m = text(join(dist, PRECACHE_ARTIFACT)).match(/\/\*PRECACHE_START\*\/([\s\S]*?)\/\*PRECACHE_END\*\//);
  expect(m, 'PRECACHE_START/END markers in precache artifact').not.toBeNull();
  const list = JSON.parse(m![1]) as string[];
  expect(Array.isArray(list) && list.length > 0, 'precache list is a non-empty array').toBe(true);
  return list;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(p)) : [p];
  });
}
const text = (p: string) => readFileSync(p, 'utf8');
const BIN = /\.(png|woff2?|ico|jpg|jpeg|gif|webp)$/i;

test('(c) dist exists and has woff2 fonts', () => {
  expect(existsSync(join(dist, 'index.html'))).toBe(true);
  expect(walk(dist).filter((f) => f.endsWith('.woff2')).length).toBeGreaterThanOrEqual(3);
});

test('(c) every dist woff2 is in the SW precache list', () => {
  const list = precacheList().map((p) => p.replace(/^\.\//, ''));
  const fonts = walk(dist).filter((f) => f.endsWith('.woff2')).map((f) => f.slice(dist.length + 1).split('\\').join('/'));
  expect(fonts.filter((rel) => !list.includes(rel)), 'woff2 files not in precache list').toEqual([]);
  // every listed file really exists in dist (the list is derived from the build, not hand-written)
  expect(list.filter((l) => !existsSync(join(dist, l))), 'precache entries with no file in dist').toEqual([]);
  // the css and entry js are precached too
  for (const f of walk(join(dist, 'assets')).map((f) => f.slice(dist.length + 1))) expect(list, f).toContain(f);
});

test('(c) latin subset only: no latin-ext/vietnamese/cyrillic/greek font files in dist', () => {
  const bad = walk(dist).filter((f) => /latin-ext|vietnamese|cyrillic|greek|devanagari|hebrew|arabic/i.test(basename(f)));
  expect(bad).toEqual([]);
  // and the CSS must not declare non-latin subsets either
  const css = walk(dist).filter((f) => /\.(css|html)$/.test(f)).map(text).join('\n');
  expect(css).not.toMatch(/latin-ext|vietnamese|cyrillic|greek/i);
  expect(css).toMatch(/font-display:\s*swap/);
  for (const fam of ['Bricolage Grotesque', 'DM Sans', 'DM Mono']) {
    expect(css, `@font-face for ${fam}`).toMatch(new RegExp(`font-family:\\s*['"]${fam}['"]`));
  }
  expect(css).toMatch(/\.woff2/);
});

test('(c) no googleapis/gstatic in dist or apps/free sources', () => {
  const roots = [
    ...walk(dist),
    join(free, 'index.html'),
    ...walk(join(free, 'src')),
    ...walk(join(free, 'public')),
  ].filter((f) => existsSync(f) && statSync(f).isFile() && !BIN.test(f));
  const hits = roots.filter((f) => /googleapis|gstatic/i.test(text(f)));
  expect(hits).toEqual([]);
  // also no external http(s) font/stylesheet/script link in the html
  const html = text(join(dist, 'index.html'));
  expect(html).not.toMatch(/<link[^>]+href=["']https?:\/\//i);
  expect(html).not.toMatch(/<script[^>]+src=["']https?:\/\//i);
});

test('(d) SW deletes only net-picking-next- caches and the cache name is bumped from v2', () => {
  const sw = text(join(dist, SW_FILE));
  expect(sw).toContain('net-picking-next-');
  // every cache deletion is guarded by the own-prefix check
  expect(sw).toMatch(/startsWith\(\s*(P|['"]net-picking-next-['"])\s*\)/);
  expect(sw).toMatch(/const\s+P\s*=\s*['"]net-picking-next-['"]|startsWith\(\s*['"]net-picking-next-['"]/);
  expect(sw).not.toMatch(/net-picking-(?!next-)/);
  // no unconditional delete-all
  expect(sw).not.toMatch(/keys\(\)\s*\.then\(\s*\w+\s*=>\s*Promise\.all\(\s*\w+\.map\(\s*\w+\s*=>\s*caches\.delete/);
  // cache name: P + 'vN' or a literal; must not be v2
  expect(sw).not.toMatch(/net-picking-next-v2\b/);
  expect(sw).not.toMatch(/P\s*\+\s*['"]v2['"]/);
  const m = sw.match(/P\s*\+\s*['"]([^'"]+)['"]/) ?? sw.match(/['"]net-picking-next-([^'"]+)['"]/);
  expect(m, 'cache name definition found').not.toBeNull();
  expect(m![1]).not.toBe('v2');
});
