// Behaviour test: run the service worker in a stubbed ServiceWorker global with a fake CacheStorage.
// Cache Storage is shared across the origin, and the live sw.js deletes every cache not named
// 'net-picking-v1' on activate. The preview must therefore never delete a cache it does not own
// and must never use the live name. Set SW_UNDER_TEST to an absolute path to run against another file.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const free = resolve(import.meta.dirname, '../..');
const swPath = process.env.SW_UNDER_TEST ?? resolve(free, 'public/sw.js');
const PREFIX = 'net-picking-next-';
const LIVE = 'net-picking-v1';

async function runSw(initial: string[]) {
  const store = new Map<string, Map<string, unknown>>(initial.map((n) => [n, new Map()]));
  const opened: string[] = [];
  const caches = {
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    open: async (n: string) => {
      opened.push(n);
      if (!store.has(n)) store.set(n, new Map());
      return { addAll: async () => undefined, put: async () => undefined };
    },
    match: async () => undefined,
  };
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
    skipWaiting: () => undefined,
    clients: { claim: () => undefined },
  };
  vm.runInNewContext(readFileSync(swPath, 'utf8'), { self, caches, fetch: async () => ({}) });
  const fire = async (t: string) => {
    const waits: Promise<unknown>[] = [];
    handlers[t]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  await fire('install');
  await fire('activate');
  return { names: [...store.keys()], opened };
}

describe('sw.js behaviour (stubbed ServiceWorker + fake CacheStorage)', () => {
  it('uses its own prefixed cache name, never the live one', async () => {
    const { opened } = await runSw([]);
    expect(opened.length).toBeGreaterThan(0);
    for (const n of opened) {
      expect(n).not.toBe(LIVE);
      expect(n.startsWith(PREFIX)).toBe(true);
    }
    expect(opened).toContain('net-picking-next-v1');
  });

  it('activate keeps live, foreign and current caches; deletes only old own caches', async () => {
    const { names } = await runSw([LIVE, 'some-other-cache', 'net-picking-next-v0', 'net-picking-next-v1']);
    expect(names).toContain(LIVE);
    expect(names).toContain('some-other-cache');
    expect(names).toContain('net-picking-next-v1');
    expect(names).not.toContain('net-picking-next-v0');
  });

  it('never deletes anything it does not own', async () => {
    const foreign = [LIVE, 'some-other-cache', 'workbox-precache', 'net-picking-v2', 'net-picking-nextish'];
    const { names } = await runSw([...foreign, 'net-picking-next-v1']);
    for (const f of foreign) expect(names, f).toContain(f);
  });
});
