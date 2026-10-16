// Behaviour test: run the service worker in a stubbed ServiceWorker global with a fake CacheStorage.
// Post-cutover (4d) rules: the worker owns exactly one versioned cache net-picking-v<n> with n != 1 (v1 was the old
// app's cache). On activate it deletes net-picking-v1 (the old app) and any net-picking-next-* (the retired
// preview), and nothing else: other apps' caches on the same origin must survive.
// Set SW_UNDER_TEST to an absolute path to run against another file.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const free = resolve(import.meta.dirname, '../..');
const swPath = process.env.SW_UNDER_TEST ?? resolve(free, 'public/sw.js');
const OLD_APP = 'net-picking-v1';
const RETIRED = ['net-picking-next-v1', 'net-picking-next-v2', 'net-picking-next-v3'];

// Ask the worker which own cache it uses: net-picking-v<n>, n != 1.
const OWN = /^net-picking-v(\d+)$/;
const isOwn = (n: string) => OWN.test(n) && n !== OLD_APP;

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
  return { names: [...store.keys()], opened, current: opened.find(isOwn) as string };
}

describe('sw.js behaviour (stubbed ServiceWorker + fake CacheStorage)', () => {
  it('opens only a net-picking-v<n> cache with n != 1', async () => {
    const { opened } = await runSw([]);
    expect(opened.length).toBeGreaterThan(0);
    for (const n of opened) {
      expect(n).not.toBe(OLD_APP);
      expect(isOwn(n), n).toBe(true);
    }
  });

  it('activate deletes the old app cache and every net-picking-next-* cache, keeps the current cache', async () => {
    const { current } = await runSw([]);
    const { names } = await runSw([OLD_APP, ...RETIRED, 'net-picking-next-v99', current]);
    expect(names).toContain(current);
    for (const gone of [OLD_APP, ...RETIRED, 'net-picking-next-v99']) expect(names, gone).not.toContain(gone);
  });

  it('only deletes what it owns: foreign caches survive activation', async () => {
    const { current } = await runSw([]);
    const foreign = ['someone-else', 'other-app-v1', 'workbox-precache', 'net-picking-nextish', 'my-net-picking-v1'];
    const { names } = await runSw([...foreign, OLD_APP, ...RETIRED, current]);
    for (const f of foreign) expect(names, f).toContain(f);
    expect(names).not.toContain(OLD_APP);
  });

  it('with only foreign caches present, nothing foreign is deleted and the own cache is created', async () => {
    const foreign = ['someone-else', 'other-app-v1'];
    const { names, current } = await runSw(foreign);
    for (const f of foreign) expect(names).toContain(f);
    expect(isOwn(current)).toBe(true);
    expect(names).toContain(current);
  });
});
