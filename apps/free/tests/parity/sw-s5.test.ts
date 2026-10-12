// Stage S5 (offline): the worker must precache the built entry JS under cache net-picking-next-v2, and drop the
// old net-picking-next-v1 cache, while still deleting only caches it owns (prefix net-picking-next-).
import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const free = resolve(import.meta.dirname, '../..');
const dist = resolve(free, 'dist');
const swPath = process.env.SW_UNDER_TEST ?? resolve(dist, 'sw.js');
const LIVE = 'net-picking-v1';
const PREFIX = 'net-picking-next-';

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
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: free, stdio: 'pipe' });
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const m = html.match(/<script[^>]*type="module"[^>]*\ssrc="([^"]+)"/) ?? html.match(/<script[^>]*\ssrc="([^"]+)"[^>]*type="module"/);
  if (!m) throw new Error('built dist/index.html has no module script src');
  entry = m[1].replace(/^\.\//, '');
}, 120_000);

describe('S5 service worker', () => {
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
  it('uses cache net-picking-next-v2 only', async () => {
    const { opened } = await runSw([]);
    expect(opened).toContain('net-picking-next-v2');
    for (const n of opened) expect(n).toBe('net-picking-next-v2');
  });
  it('activation removes net-picking-next-v1 and keeps v2, the live cache and foreign caches', async () => {
    const { names } = await runSw([LIVE, 'some-other-cache', 'net-picking-next-v1', 'net-picking-next-v2']);
    expect(names).not.toContain('net-picking-next-v1');
    expect(names).toContain('net-picking-next-v2');
    expect(names).toContain(LIVE);
    expect(names).toContain('some-other-cache');
  });
  it('still deletes only caches starting with net-picking-next-', () => {
    const src = readFileSync(swPath, 'utf8');
    expect(src).toContain('k.startsWith(P)');
    expect(src).toMatch(/const P='net-picking-next-'/);
    expect(src).not.toContain('ks.filter(k=>k!==C)');
    expect(PREFIX).toBe('net-picking-next-');
  });
});
