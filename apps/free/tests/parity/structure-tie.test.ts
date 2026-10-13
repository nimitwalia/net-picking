// Tie-rule item: structure rules that e2e cannot see.
//  - no local checkScore in the app (it comes from @net-picking/core);
//  - the remembered-default storage key is its own key (never the tournament key, the live app's key, or any key
//    the root index.html uses);
//  - no network capability added compared with main (AGENTS.md rule 5).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blankLiterals, coreLocal, definesLocally, free, readMain, root, stripComments } from './src-helpers';

const TOURNAMENT_KEY = 'pickleball_tournament_next_v1';
const PREFS_KEY = 'pickleball_prefs_next_v1';
const nc = stripComments(readMain());
const code = blankLiterals(nc);

describe('checkScore', () => {
  it('is not defined locally in apps/free/src and is imported from @net-picking/core', () => {
    expect(definesLocally(code, 'checkScore')).toBe(false);
    expect(/(?:function|const|let|var)\s+checkScore\b/.test(nc)).toBe(false);
    expect(coreLocal(nc, 'checkScore')).toBe('checkScore');
  });
});

describe('storage keys', () => {
  const keysIn = (s: string) => new Set(s.match(/pickleball_[A-Za-z0-9_]+/g) ?? []);
  const mine = keysIn(nc);
  const rootKeys = new Set([
    ...keysIn(readFileSync(resolve(root, 'index.html'), 'utf8')),
    ...keysIn(readFileSync(resolve(root, 'sw.js'), 'utf8')),
  ]);
  it('the app uses exactly the tournament key and the prefs key', () => {
    expect([...mine].sort()).toEqual([PREFS_KEY, TOURNAMENT_KEY].sort());
  });
  it('the prefs key differs from the tournament key, the live key and every root key', () => {
    expect(PREFS_KEY).not.toBe(TOURNAMENT_KEY);
    expect(PREFS_KEY).not.toBe('pickleball_tournament_v1');
    expect(rootKeys.has(PREFS_KEY)).toBe(false);
    expect(rootKeys.has('pickleball_tournament_v1')).toBe(true); // sanity: the scan does see the root key
  });
  it('the tournament key is unchanged and not shared with the root', () => {
    expect(rootKeys.has(TOURNAMENT_KEY)).toBe(false);
  });
});

describe('no network calls added compared with main', () => {
  let mainSrc: string | null = null;
  let mainIndex: string | null = null;
  try {
    mainSrc = execFileSync('git', ['show', 'main:apps/free/src/main.js'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    mainIndex = execFileSync('git', ['show', 'main:apps/free/index.html'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { /* main not available (e.g. shallow clone): the comparison tests below are skipped and say so */ }

  const TOKENS: Array<[string, RegExp]> = [
    ['fetch', /(?<![\w$.])fetch\b/g], ['XMLHttpRequest', /XMLHttpRequest/g], ['WebSocket', /WebSocket/g],
    ['sendBeacon', /sendBeacon/g], ['EventSource', /EventSource/g], ['new URL', /new\s+URL\b/g],
    ['importScripts', /importScripts/g], ['dynamic import()', /(?<![\w$.])import\s*\(/g], ['Image src', /new\s+Image\b/g],
  ];
  const count = (c: string, re: RegExp) => (c.match(re) ?? []).length;
  const urls = (s: string) => [...new Set(s.match(/https?:\/\/[^\s'"`)<>]+/g) ?? [])].sort();

  it.skipIf(mainSrc === null)('no network API token occurs more often than on main', () => {
    const before = blankLiterals(stripComments(mainSrc!));
    for (const [name, re] of TOKENS) expect(count(code, re), name).toBeLessThanOrEqual(count(before, re));
  });
  it.skipIf(mainSrc === null)('no new http(s) URL in src or index.html compared with main', () => {
    const now = new Set([...urls(nc), ...urls(readFileSync(resolve(free, 'index.html'), 'utf8'))]);
    const was = new Set([...urls(stripComments(mainSrc!)), ...urls(mainIndex!)]);
    expect([...now].filter((u) => !was.has(u))).toEqual([]);
  });
  it('absolute guard (independent of main): no fetch, XHR, WebSocket, beacon or EventSource in src', () => {
    for (const [name, re] of TOKENS.filter(([n]) => ['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'importScripts'].includes(n)))
      expect(count(code, re), name).toBe(0);
  });
});
