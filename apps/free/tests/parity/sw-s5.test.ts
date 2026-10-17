// Offline precache of the built app (cutover 4d rules): the worker precaches the built entry JS, index, manifest,
// icons and the self-hosted fonts under one net-picking-v<n> cache (n != 1), and on activation drops the old app
// cache net-picking-v1 and retired net-picking-next-* caches while deleting nothing it does not own.
import { describe, expect, it, beforeAll } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { requireFreshDist } from '../e2e/require-dist';

const free = resolve(import.meta.dirname, '../..');
const dist = resolve(free, 'dist');
const swPath = process.env.SW_UNDER_TEST ?? resolve(dist, 'sw.js');
const OLD_APP = 'net-picking-v1';
const isOwn = (n: string) => /^net-picking-v\d+$/.test(n) && n !== OLD_APP;

async function runSw(initial: string[]) {
  const store = new Map<string, Map<string, unknown>>(initial.map((n) => [n, new Map()]));
  const opened: string[] = [];
  let files: string[] = [];
  const caches = {
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    open: async (n: string) => {
      opened.push(n);
      if (!store.has(n)) store.set(n, new Map());
      return { addAll: async (f: string[]) => { files = f; }, put: async () => undefined };
    },
    match: async () => undefined,
  };
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = { addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h), skipWaiting: () => undefined, clients: { claim: () => undefined } };
  vm.runInNewContext(readFileSync(swPath, 'utf8'), { self, caches, fetch: async () => ({}) });
  const fire = async (t: string) => { const w: Promise<unknown>[] = []; handlers[t]({ waitUntil: (p: Promise<unknown>) => w.push(p) }); await Promise.all(w); };
  await fire('install');
  await fire('activate');
  return { names: [...store.keys()], opened, files };
}

let entry = '';
beforeAll(() => {
  requireFreshDist(); // never builds; fails with a clear message if dist is missing or stale
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const m = html.match(/<script[^>]*type="module"[^>]*\ssrc="([^"]+)"/) ?? html.match(/<script[^>]*\ssrc="([^"]+)"[^>]*type="module"/);
  if (!m) throw new Error('built dist/index.html has no module script src');
  entry = m[1].replace(/^\.\//, '');
});

describe('service worker precache and cleanup', () => {
  it('built entry JS exists in dist and has a fixed, non-hashed file name', () => {
    expect(existsSync(resolve(dist, entry)), entry).toBe(true);
    const base = entry.split('/').pop()!;
    expect(base.endsWith('.js')).toBe(true);
    expect(/[-.][A-Za-z0-9_-]{8}\.js$/.test(base), `entry ${base} must not carry a content hash`).toBe(false);
  });
  it('the entry JS is listed in the precache FILES (with or without ./ prefix) and every FILES entry exists in dist', async () => {
    const { files } = await runSw([]);
    const norm = files.map((f) => f.replace(/^\.\//, ''));
    expect(norm, `FILES=${JSON.stringify(files)}`).toContain(entry);
    for (const f of norm) if (f !== '' && f !== '.') expect(existsSync(resolve(dist, f)), `precached ${f} missing from dist`).toBe(true);
    for (const must of ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) expect(norm).toContain(must);
  });
  it('every built woff2 font is in the precache list', async () => {
    const { files } = await runSw([]);
    const norm = files.map((f) => f.replace(/^\.\//, ''));
    const fonts = readdirSync(resolve(dist, 'assets')).filter((f) => f.endsWith('.woff2')).map((f) => `assets/${f}`);
    expect(fonts.length, 'built fonts present').toBeGreaterThanOrEqual(3);
    for (const f of fonts) expect(norm, f).toContain(f);
  });
  it('uses a single net-picking-v<n> cache, n != 1', async () => {
    const { opened } = await runSw([]);
    expect(opened.length).toBeGreaterThan(0);
    for (const n of opened) expect(isOwn(n), n).toBe(true);
    expect(new Set(opened).size).toBe(1);
  });
  it('activation removes net-picking-v1 and net-picking-next-*, keeps the current and foreign caches', async () => {
    const { opened } = await runSw([]);
    const cur = opened[0];
    const { names } = await runSw([OLD_APP, 'net-picking-next-v3', 'net-picking-next-v1', cur, 'someone-else', 'other-app-v1']);
    expect(names).not.toContain(OLD_APP);
    expect(names).not.toContain('net-picking-next-v3');
    expect(names).not.toContain('net-picking-next-v1');
    expect(names).toContain(cur);
    expect(names).toContain('someone-else');
    expect(names).toContain('other-app-v1');
  });
});
